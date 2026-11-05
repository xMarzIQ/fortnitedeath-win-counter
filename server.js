const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const CONTROL_KEY = process.env.CONTROL_KEY || "";
const STATE_FILE = process.env.STATE_FILE || path.join(__dirname, "data", "state.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_HISTORY = 25;

let state = { streak: 0, wins: 0, history: [] };

function load() {
  try {
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    state.streak = Math.max(0, parseInt(saved.streak, 10) || 0);
    state.wins = Math.max(0, parseInt(saved.wins, 10) || 0);
    state.history = Array.isArray(saved.history) ? saved.history.slice(-MAX_HISTORY) : [];
  } catch (e) {
    /* first run, start at zero */
  }
}

function save() {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    const tmp = STATE_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, STATE_FILE);
  } catch (e) {
    console.error("Could not save state:", e.message);
  }
}

function publicState() {
  return { streak: state.streak, wins: state.wins, canUndo: state.history.length > 0 };
}

function pushHistory() {
  state.history.push({ streak: state.streak, wins: state.wins });
  if (state.history.length > MAX_HISTORY) state.history.shift();
}

function toCount(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 9999) : null;
}

function applyAction(body) {
  switch (body.action) {
    case "loss":
      pushHistory();
      state.streak += 1;
      return true;
    case "win":
      pushHistory();
      state.streak = 0;
      state.wins += 1;
      return true;
    case "unloss":
      if (state.streak < 1) return false;
      pushHistory();
      state.streak -= 1;
      return true;
    case "unwin":
      if (state.wins < 1) return false;
      pushHistory();
      state.wins -= 1;
      return true;
    case "undo": {
      const prev = state.history.pop();
      if (!prev) return false;
      state.streak = prev.streak;
      state.wins = prev.wins;
      return true;
    }
    case "reset":
      pushHistory();
      state.streak = 0;
      state.wins = 0;
      return true;
    case "set": {
      const s = toCount(body.streak);
      const w = toCount(body.wins);
      if (s === null || w === null) return false;
      pushHistory();
      state.streak = s;
      state.wins = w;
      return true;
    }
    default:
      return false;
  }
}

const clients = new Set();

function broadcast() {
  const msg = "data: " + JSON.stringify(publicState()) + "\n\n";
  for (const res of clients) res.write(msg);
}

function keyOk(req) {
  if (!CONTROL_KEY) return true;
  const given = Buffer.from(String(req.headers["x-key"] || ""));
  const want = Buffer.from(CONTROL_KEY);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

function sendJson(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function serveStatic(res, file) {
  const full = path.join(PUBLIC_DIR, file);
  if (!full.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(full)] || "application/octet-stream",
      "Cache-Control": /\.(woff2|png|svg)$/.test(full) ? "public, max-age=86400" : "no-cache",
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET" && url.pathname === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 2000\n");
    res.write("data: " + JSON.stringify(publicState()) + "\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/state") {
    return sendJson(res, 200, publicState());
  }

  if (req.method === "POST" && url.pathname === "/api/action") {
    if (!keyOk(req)) return sendJson(res, 401, { error: "Wrong or missing key" });
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 5000) req.destroy();
    });
    req.on("end", () => {
      let body;
      try {
        body = JSON.parse(raw || "{}");
      } catch (e) {
        return sendJson(res, 400, { error: "Bad JSON" });
      }
      if (!applyAction(body)) return sendJson(res, 400, { error: "Nothing changed" });
      save();
      broadcast();
      sendJson(res, 200, publicState());
    });
    return;
  }

  if (req.method === "GET") {
    if (url.pathname === "/" || url.pathname === "/control") return serveStatic(res, "control.html");
    if (url.pathname === "/overlay") return serveStatic(res, "overlay.html");
    return serveStatic(res, url.pathname.replace(/^\/+/, ""));
  }

  res.writeHead(405);
  res.end();
});

setInterval(() => {
  for (const res of clients) res.write(": keepalive\n\n");
}, 20000);

load();
server.listen(PORT, () => {
  console.log("Streak overlay running on port " + PORT);
  if (!CONTROL_KEY) console.warn("CONTROL_KEY is not set: anyone with the link can change the counters.");
});
