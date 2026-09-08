from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, urlencode, urljoin
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import ipaddress
import socket
import json
import re

# =========================================================
# Shared safety / URL helpers
# =========================================================

URI_ATTR_RE = re.compile(r'URI="([^"]+)"', re.I)

M3U8_RE = re.compile(
    r'["\']((?:https?:)?//[^"\'<> ]+?\.m3u8(?:\?[^"\'<> ]*)?)["\']',
    re.I
)

VTT_RE = re.compile(
    r'["\']((?:https?:)?//[^"\'<> ]+?\.vtt(?:\?[^"\'<> ]*)?)["\']',
    re.I
)

def _is_private_host(hostname: str) -> bool:
    if not hostname:
        return True

    h = hostname.strip().lower().rstrip(".")
    if h in {"localhost", "localhost.localdomain"}:
        return True

    try:
        ip = ipaddress.ip_address(h.strip("[]"))
        return (
            ip.is_private or ip.is_loopback or ip.is_link_local or
            ip.is_multicast or ip.is_reserved or ip.is_unspecified
        )
    except ValueError:
        pass

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
        pass

    return False

def _validate_url(raw: str):
    u = urlparse(raw)
    if u.scheme not in ("http", "https"):
        raise ValueError("Only http/https URLs are supported")
    if not u.hostname or _is_private_host(u.hostname):
        raise ValueError("Private/local target is not allowed")
    return u

# =========================================================
# HLS proxy helpers
# =========================================================

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

        def repl(match):
            absolute = urljoin(base_url, match.group(1))
            return f'URI="{_proxy_url(absolute, origin, referer, host, proto)}"'

        line2 = URI_ATTR_RE.sub(repl, line)

        if stripped and not stripped.startswith("#"):
            absolute = urljoin(base_url, stripped)
            line2 = _proxy_url(absolute, origin, referer, host, proto)

        out.append(line2)

    return "\n".join(out)

# =========================================================
# Generic resolver helpers
# =========================================================

def _extract_json_stream(obj):
    if not isinstance(obj, dict):
        return None, None

    stream = None
    vtt = None

    media = obj.get("media")
    if isinstance(media, dict):
        stream = media.get("stream") or media.get("m3u8") or media.get("url")
        vtt = media.get("vtt") or media.get("preview") or media.get("thumbnails")

    stream = stream or obj.get("stream") or obj.get("m3u8")
    vtt = vtt or obj.get("vtt") or obj.get("preview")

    stream = stream.strip() if isinstance(stream, str) else None
    vtt = vtt.strip() if isinstance(vtt, str) else None

    return stream, vtt

# =========================================================
# Vercel handler
# =========================================================

class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Range, Content-Type")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path.rstrip("/")

        if path.endswith("/resolve"):
            self._handle_resolve()
        else:
            # Default to HLS proxy for /api/hlsproxy and direct function invocation.
            self._handle_hlsproxy()

    # -----------------------------------------------------
    # /api/hlsproxy
    # -----------------------------------------------------

    def _handle_hlsproxy(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)

        raw_url = (qs.get("url") or [""])[0]
        origin = (qs.get("origin") or [""])[0].strip()
        referer = (qs.get("referer") or [""])[0].strip()

        if not raw_url:
            self._text(400, "Missing ?url=")
            return

        try:
            _validate_url(raw_url)
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
                try:
                    self.end_headers()
                    self.wfile.write(str(e).encode("utf-8"))
                except Exception:
                    pass
            return

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

    # -----------------------------------------------------
    # /api/resolve
    # -----------------------------------------------------

    def _handle_resolve(self):
        try:
            parsed = urlparse(self.path)
            qs = parse_qs(parsed.query)
            raw = (qs.get("url") or [""])[0].strip()

            if not raw:
                self._json(400, {"ok": False, "error": "Missing ?url="})
                return

            target = _validate_url(raw)

            # Direct HLS URL
            if ".m3u8" in target.path.lower():
                self._json(200, {
                    "ok": True,
                    "stream": raw,
                    "vtt": None,
                    "type": "direct-m3u8"
                })
                return

            headers = {
                "Accept": "text/html,application/json,text/plain,*/*",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            }

            req = Request(raw, headers=headers, method="GET")

            try:
                upstream = urlopen(req, timeout=20)
            except HTTPError as e:
                self._json(e.code, {
                    "ok": False,
                    "error": f"Upstream HTTP {e.code}"
                })
                return
            except URLError as e:
                self._json(502, {
                    "ok": False,
                    "error": f"Upstream error: {e.reason}"
                })
                return

            content_type = (upstream.headers.get("Content-Type") or "").lower()
            final_url = upstream.geturl()

            # Limit resolver response inspection to 2 MB.
            raw_body = upstream.read(2 * 1024 * 1024)
            text = raw_body.decode("utf-8", errors="replace")

            # JSON metadata
            if "json" in content_type or text.lstrip().startswith(("{", "[")):
                try:
                    obj = json.loads(text)
                    stream, vtt = _extract_json_stream(obj)

                    if stream:
                        stream = urljoin(final_url, stream)
                        if vtt:
                            vtt = urljoin(final_url, vtt)

                        self._json(200, {
                            "ok": True,
                            "stream": stream,
                            "vtt": vtt,
                            "type": "json"
                        })
                        return
                except Exception:
                    pass

            # Explicit HLS URL embedded in public HTML/text
            match = M3U8_RE.search(text)
            if match:
                stream = match.group(1)

                if stream.startswith("//"):
                    stream = f"{target.scheme}:{stream}"

                stream = urljoin(final_url, stream)

                vtt = None
                vtt_match = VTT_RE.search(text)

                if vtt_match:
                    vtt = vtt_match.group(1)
                    if vtt.startswith("//"):
                        vtt = f"{target.scheme}:{vtt}"
                    vtt = urljoin(final_url, vtt)

                self._json(200, {
                    "ok": True,
                    "stream": stream,
                    "vtt": vtt,
                    "type": "html-explicit"
                })
                return

            self._json(404, {
                "ok": False,
                "error": "No explicit HLS stream found"
            })

        except ValueError as e:
            self._json(403, {"ok": False, "error": str(e)})
        except Exception as e:
            self._json(500, {"ok": False, "error": str(e)})

    # -----------------------------------------------------
    # response helpers
    # -----------------------------------------------------

    def _json(self, code: int, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _text(self, code: int, text: str):
        body = text.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        pass
