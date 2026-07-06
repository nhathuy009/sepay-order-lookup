"""Serverless function: tra cứu 1 mã đơn hàng. POST JSON {code, access_token}."""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.append(os.path.dirname(__file__))
from _core import lookup_order, check_access, APP_ACCESS_TOKEN  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        # Cho biết app có bật bảo vệ hay không (frontend dùng để hiện ô mật khẩu).
        self._send(200, {"auth_required": bool(APP_ACCESS_TOKEN)})

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length) if length else b"{}"
            body = json.loads(raw.decode("utf-8") or "{}")
        except (ValueError, json.JSONDecodeError):
            self._send(400, {"error": "JSON không hợp lệ"})
            return

        token = body.get("access_token") or self.headers.get("X-Access-Token", "")
        if not check_access(token):
            self._send(401, {"error": "Sai mật khẩu truy cập"})
            return

        code = (body.get("code") or "").strip()
        if not code:
            self._send(400, {"error": "Thiếu mã đơn hàng"})
            return

        result = lookup_order(code)
        self._send(200, result)
