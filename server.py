import base64
import hashlib
import hmac
import http.server
import json
import os
import secrets
import socketserver
import time
import urllib.parse
import urllib.error
import urllib.request
from http import cookies

PORT = 5501
DATA_DIR = "data"
USER_STORE = os.path.join(DATA_DIR, "users.json")
SESSION_TTL_SECONDS = 60 * 60 * 24 * 14


def ensure_store():
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(USER_STORE):
        write_store({"users": {}, "sessions": {}})


def read_store():
    ensure_store()
    with open(USER_STORE, "r", encoding="utf-8") as f:
        return json.load(f)


def write_store(store):
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp_path = USER_STORE + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(store, f, indent=2)
    os.replace(tmp_path, USER_STORE)


def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 180000)
    return salt, base64.b64encode(digest).decode("ascii")


def password_matches(password, salt, expected_hash):
    _, actual_hash = hash_password(password, salt)
    return hmac.compare_digest(actual_hash, expected_hash)


def clean_username(username):
    username = (username or "").strip().lower()
    if not username or len(username) > 40:
        return ""
    allowed = set("abcdefghijklmnopqrstuvwxyz0123456789._-")
    return username if all(ch in allowed for ch in username) else ""


def mask_key(value):
    if not value:
        return ""
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}...{value[-4:]}"


class CinematicHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200, "ok")
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/data/"):
            self.send_json({"error": "Not found"}, 404)
            return

        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/auth/me":
            self.handle_auth_me()
            return
        if parsed.path == "/api/settings":
            self.handle_get_settings()
            return
        if parsed.path.startswith("/api/tmdb/"):
            self.proxy_tmdb(parsed)
            return
        if parsed.path == "/api/omdb":
            self.proxy_omdb(parsed)
            return

        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/auth/register":
            self.handle_register()
            return
        if parsed.path == "/api/auth/login":
            self.handle_login()
            return
        if parsed.path == "/api/auth/logout":
            self.handle_logout()
            return
        if parsed.path == "/api/settings":
            self.handle_save_settings()
            return
        if parsed.path == "/api/ai/gemini/models":
            self.proxy_gemini_models()
            return
        if parsed.path == "/api/ai/gemini/generate":
            self.proxy_gemini_generate()
            return
        if parsed.path == "/api/ai/openai/chat":
            self.proxy_openai_chat()
            return
        if parsed.path == "/save-seed":
            self.handle_save_seed()
            return

        self.send_json({"error": "Not found"}, 404)

    def read_json_body(self):
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length == 0:
            return {}
        raw = self.rfile.read(content_length).decode("utf-8")
        return json.loads(raw or "{}")

    def send_json(self, payload, status=200, extra_headers=None):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(data)

    def get_session_id(self):
        header = self.headers.get("Cookie", "")
        jar = cookies.SimpleCookie()
        jar.load(header)
        morsel = jar.get("cinematic_session")
        return morsel.value if morsel else ""

    def get_current_user(self):
        session_id = self.get_session_id()
        if not session_id:
            return None, None

        store = read_store()
        session = store.get("sessions", {}).get(session_id)
        if not session:
            return None, None

        if session.get("expires", 0) < time.time():
            store.get("sessions", {}).pop(session_id, None)
            write_store(store)
            return None, None

        username = session.get("username")
        user = store.get("users", {}).get(username)
        return username, user

    def require_user(self):
        username, user = self.get_current_user()
        if not username or not user:
            self.send_json({"error": "Login required"}, 401)
            return None, None
        return username, user

    def create_session(self, username):
        store = read_store()
        session_id = secrets.token_urlsafe(32)
        store.setdefault("sessions", {})[session_id] = {
            "username": username,
            "expires": int(time.time() + SESSION_TTL_SECONDS)
        }
        write_store(store)
        cookie = f"cinematic_session={session_id}; HttpOnly; SameSite=Lax; Path=/; Max-Age={SESSION_TTL_SECONDS}"
        return cookie

    def handle_register(self):
        try:
            body = self.read_json_body()
            username = clean_username(body.get("username"))
            password = body.get("password") or ""
            if not username or len(password) < 6:
                self.send_json({"error": "Use a valid username and a password with at least 6 characters."}, 400)
                return

            store = read_store()
            if username in store.get("users", {}):
                self.send_json({"error": "That username already exists."}, 409)
                return

            salt, password_hash = hash_password(password)
            store.setdefault("users", {})[username] = {
                "password_salt": salt,
                "password_hash": password_hash,
                "api_keys": {},
                "created_at": int(time.time())
            }
            write_store(store)
            cookie = self.create_session(username)
            self.send_json({"authenticated": True, "username": username}, 200, {"Set-Cookie": cookie})
        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def handle_login(self):
        try:
            body = self.read_json_body()
            username = clean_username(body.get("username"))
            password = body.get("password") or ""
            store = read_store()
            user = store.get("users", {}).get(username)
            if not user or not password_matches(password, user.get("password_salt", ""), user.get("password_hash", "")):
                self.send_json({"error": "Wrong username or password."}, 401)
                return

            cookie = self.create_session(username)
            self.send_json({"authenticated": True, "username": username}, 200, {"Set-Cookie": cookie})
        except Exception as e:
            self.send_json({"error": str(e)}, 500)

    def handle_logout(self):
        session_id = self.get_session_id()
        store = read_store()
        store.get("sessions", {}).pop(session_id, None)
        write_store(store)
        self.send_json(
            {"authenticated": False},
            200,
            {"Set-Cookie": "cinematic_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"}
        )

    def handle_auth_me(self):
        username, user = self.get_current_user()
        if not username:
            self.send_json({"authenticated": False})
            return

        api_keys = user.get("api_keys", {})
        self.send_json({
            "authenticated": True,
            "username": username,
            "keys": {
                "tmdb": bool(api_keys.get("tmdb")),
                "omdb": bool(api_keys.get("omdb")),
                "ai": bool(api_keys.get("ai")),
            },
            "aiProvider": "openai" if (api_keys.get("ai") or "").startswith("sk-") else ("gemini" if api_keys.get("ai") else "")
        })

    def handle_get_settings(self):
        username, user = self.require_user()
        if not username:
            return

        api_keys = user.get("api_keys", {})
        self.send_json({
            "username": username,
            "keys": {
                "tmdb": mask_key(api_keys.get("tmdb")),
                "omdb": mask_key(api_keys.get("omdb")),
                "ai": mask_key(api_keys.get("ai")),
            },
            "aiProvider": "openai" if (api_keys.get("ai") or "").startswith("sk-") else ("gemini" if api_keys.get("ai") else "")
        })

    def handle_save_settings(self):
        username, user = self.require_user()
        if not username:
            return

        body = self.read_json_body()
        store = read_store()
        user = store["users"][username]
        api_keys = user.setdefault("api_keys", {})
        for key_name in ["tmdb", "omdb", "ai"]:
            value = (body.get(key_name) or "").strip()
            if value:
                api_keys[key_name] = value

        write_store(store)
        self.send_json({"status": "saved"})

    def get_api_key(self, key_name):
        username, user = self.require_user()
        if not username:
            return None
        return user.get("api_keys", {}).get(key_name)

    def proxy_json_request(self, url, headers=None, method="GET", body=None):
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers = {**(headers or {}), "Content-Type": "application/json"}

        request = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                payload = response.read()
                self.send_response(response.status)
                self.send_header("Content-Type", response.headers.get("Content-Type", "application/json"))
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
        except urllib.error.HTTPError as e:
            payload = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", e.headers.get("Content-Type", "application/json"))
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except Exception as e:
            self.send_json({"error": str(e)}, 502)

    def proxy_tmdb(self, parsed):
        key = self.get_api_key("tmdb")
        if not key:
            return

        tmdb_path = parsed.path.replace("/api/tmdb", "", 1)
        query = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
        query = {k: v[-1] for k, v in query.items()}
        url = urllib.parse.urlunparse((
            "https",
            "api.themoviedb.org",
            f"/3{tmdb_path}",
            "",
            urllib.parse.urlencode(query),
            ""
        ))

        headers = {"accept": "application/json"}
        if key.startswith("eyJ"):
            headers["Authorization"] = f"Bearer {key}"
        else:
            separator = "&" if urllib.parse.urlparse(url).query else "?"
            url = f"{url}{separator}api_key={urllib.parse.quote(key)}"

        self.proxy_json_request(url, headers=headers)

    def proxy_omdb(self, parsed):
        key = self.get_api_key("omdb")
        if not key:
            return

        query = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
        query = {k: v[-1] for k, v in query.items() if k.lower() != "apikey"}
        query["apikey"] = key
        url = f"https://www.omdbapi.com/?{urllib.parse.urlencode(query)}"
        self.proxy_json_request(url)

    def proxy_gemini_models(self):
        key = self.get_api_key("ai")
        if not key:
            return
        if key.startswith("sk-"):
            self.send_json({"error": "Saved AI key is not a Gemini key."}, 400)
            return
        url = f"https://generativelanguage.googleapis.com/v1beta/models?key={urllib.parse.quote(key)}"
        self.proxy_json_request(url)

    def proxy_gemini_generate(self):
        key = self.get_api_key("ai")
        if not key:
            return
        if key.startswith("sk-"):
            self.send_json({"error": "Saved AI key is not a Gemini key."}, 400)
            return
        body = self.read_json_body()
        model = body.pop("model", "")
        if not model.startswith("models/"):
            self.send_json({"error": "Invalid Gemini model."}, 400)
            return
        url = f"https://generativelanguage.googleapis.com/v1beta/{model}:generateContent?key={urllib.parse.quote(key)}"
        self.proxy_json_request(url, method="POST", body=body)

    def proxy_openai_chat(self):
        key = self.get_api_key("ai")
        if not key:
            return
        if not key.startswith("sk-"):
            self.send_json({"error": "Saved AI key is not an OpenAI key."}, 400)
            return
        body = self.read_json_body()
        self.proxy_json_request(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            method="POST",
            body=body
        )

    def handle_save_seed(self):
        content_length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_length)

        try:
            js_content = post_data.decode("utf-8")
            with open("seed.js", "w", encoding="utf-8") as f:
                f.write(js_content)

            self.send_json({"status": "success"})
        except Exception as e:
            self.send_json({"status": "error", "message": str(e)}, 500)


socketserver.TCPServer.allow_reuse_address = True
ensure_store()

print("Cinematic AI Server starting...")
print(f"Open this exactly in your browser: http://127.0.0.1:{PORT}")
print("User accounts and API keys are stored locally in data/users.json")
print("(Leave this terminal running in the background)")

with socketserver.TCPServer(("", PORT), CinematicHandler) as httpd:
    httpd.serve_forever()
