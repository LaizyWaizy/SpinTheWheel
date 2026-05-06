import http.server
import socketserver
import json
import os

PORT = 5501

class CinematicHandler(http.server.SimpleHTTPRequestHandler):
    # Enable CORS if needed, though they are on the same port
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200, "ok")
        self.end_headers()

    def do_POST(self):
        if self.path == '/save-seed':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                js_content = post_data.decode('utf-8')
                # Write directly to seed.js
                with open('seed.js', 'w', encoding='utf-8') as f:
                    f.write(js_content)
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

# To handle port reuse issues that VS code sometimes causes
socketserver.TCPServer.allow_reuse_address = True

print(f"🎬 Cinematic AI Server starting...")
print(f"👉 Open this exactly in your browser: http://127.0.0.1:{PORT}")
print(f"(Leave this terminal running in the background)")

with socketserver.TCPServer(("", PORT), CinematicHandler) as httpd:
    httpd.serve_forever()
