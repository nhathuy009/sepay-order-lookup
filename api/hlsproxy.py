from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
import ipaddress
import socket
import re

# Vercel Python Serverless Function - stdlib only.
# Route: /api/hlsproxy?url=...&origin=...&referer=...
#
# For testing streams you are authorized to access.
# Private/local targets are blocked to reduce SSRF risk.

URI_ATTR_RE = re.compile(r'URI="([^"]+)"', re.I)

def _is_private_host(hostname: str) -> bool:
    if not hostname:
        return True

    h = hostname.strip().lower().rstrip(".")
    if h in {"localhost", "localhost.localdomain"}:
        return True

    # Literal IP
    try:
        ip = ipaddress.ip_address(h.strip("[]"))
        return (
            ip.is_private or ip.is_loopback or ip.is_link_local or
            ip.is_multicast or ip.is_reserved or ip.is_unspecified
        )
    except ValueError:
        pass

    # Resolve hostname and reject if any resolved address is local/private.
    try:
        infos = socket.getaddrinfo(h, None, proto=socket.IPPROTO_TCP)
        for info in infos:
            addr = info[4][0]
            try:
                ip = ipaddress.ip_address(addr)
                if (
                    ip.is_private or ip.is_loopback or ip.is_link_local or
                    ip.is_multicast or ip.is_reserved or ip.is_unspecified
                ):
                    return True
            except ValueError:
                continue
    except Exception:
        # Let the upstream request surface DNS errors normally.
        pass

    return False

def _valid_target(raw: str):
    u = urlparse(raw)
    if u.scheme not in ("http", "https"):
        raise ValueError("Only http/https targets are allowed")
    if not u.hostname or _is_private_host(u.hostname):
        raise ValueError("Private/local target is not allowed")
    return u

def _proxy_url(target: str, origin: str, referer: str, host: str, proto: str) -> str:
    q = {"url": target}
    if origin:
        q["origin"] = origin
    if referer:
        q["referer"] = referer
    return f"{proto}://{host}/api/hlsproxy?{urlencode(q)}"

def _rewrite_playlist(text: str, base_url: str, origin: str, referer: str, host: str, proto: str) -> str:
    out = []

    for line in text.splitlines():
        stripped = line.strip()

        # Rewrite URI="..." attributes used by EXT-X-KEY, EXT-X-MAP,
        # EXT-X-MEDIA, etc.
        def repl(match):
            absolute = urljoin(base_url, match.group(1))
            return f'URI="{_proxy_url(absolute, origin, referer, host, proto)}"'

        line2 = URI_ATTR_RE.sub(repl, line)

        # Rewrite bare URI lines: child playlists, media segments, subtitles...
        if stripped and not stripped.startswith("#"):
            absolute = urljoin(base_url, stripped)
            line2 = _proxy_url(absolute, origin, referer, host, proto)

        out.append(line2)

    return "\n".join(out)

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Range, Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)

        raw_url = (qs.get("url") or [""])[0]
        origin = (qs.get("origin") or [""])[0].strip()
        referer = (qs.get("referer") or [""])[0].strip()

        if not raw_url:
            self._text(400, "Missing ?url=")
            return

        try:
            _valid_target(raw_url)
        except ValueError as e:
            self._text(403, str(e))
            return

        headers = {
            "Accept": self.headers.get("Accept", "*/*"),
            "User-Agent": self.headers.get(
                "User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            ),
        }

        if origin:
            headers["Origin"] = origin
        if referer:
            headers["Referer"] = referer
        if self.headers.get("Range"):
            headers["Range"] = self.headers["Range"]

        req = Request(raw_url, headers=headers, method="GET")

        try:
            upstream = urlopen(req, timeout=25)
            status = getattr(upstream, "status", 200)
        except HTTPError as e:
            upstream = e
            status = e.code
        except URLError as e:
            self._text(502, f"Upstream error: {e.reason}")
            return
        except Exception as e:
            self._text(500, f"Proxy error: {e}")
            return

        content_type = upstream.headers.get("Content-Type", "")
        final_url = upstream.geturl()

        is_hls = (
            "mpegurl" in content_type.lower()
            or ".m3u8" in urlparse(final_url).path.lower()
            or ".m3u8" in urlparse(raw_url).path.lower()
        )

        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")

        if is_hls:
            try:
                raw = upstream.read()
                text = raw.decode("utf-8", errors="replace")

                host = self.headers.get("Host", "")
                proto = (self.headers.get("X-Forwarded-Proto") or "https").split(",")[0].strip()

                body = _rewrite_playlist(
                    text=text,
                    base_url=final_url,
                    origin=origin,
                    referer=referer,
                    host=host,
                    proto=proto,
                ).encode("utf-8")

                self.send_header("Content-Type", "application/vnd.apple.mpegurl")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except Exception as e:
                # Headers may already be committed here on some runtimes;
                # keep failure simple.
                try:
                    self.end_headers()
                    self.wfile.write(str(e).encode("utf-8"))
                except Exception:
                    pass
            return

        # Pass selected upstream headers for binary/media responses.
        for name in (
            "Content-Type",
            "Content-Length",
            "Accept-Ranges",
            "Content-Range",
            "ETag",
            "Last-Modified",
        ):
            value = upstream.headers.get(name)
            if value:
                self.send_header(name, value)

        self.end_headers()

        # Stream response instead of loading the entire segment into memory.
        try:
            while True:
                chunk = upstream.read(256 * 1024)
                if not chunk:
                    break
                self.wfile.write(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            try:
                upstream.close()
            except Exception:
                pass

    def log_message(self, format, *args):
        # Keep Vercel logs quieter.
        pass

    def _text(self, code: int, text: str):
        body = text.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
