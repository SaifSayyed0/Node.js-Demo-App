// Notes app backend: plain Node.js, zero dependencies.
// Run: node server.js   ->  open http://localhost:3000
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;   // the "door number" your server listens on
const HOST = "0.0.0.0";                  // listen on ALL network interfaces (needed on EC2)
const NOTES_DIR = path.join(__dirname, "notes");
const PUBLIC_DIR = path.join(__dirname, "public");

// Create the notes folder on first start
if (!fs.existsSync(NOTES_DIR)) {
  fs.mkdirSync(NOTES_DIR);
  console.log(`[setup] Created folder: ${NOTES_DIR}`);
}

const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };

// "My Note!" -> "My-Note" (stops people writing to ../../etc/passwd)
const safeName = (s) => String(s).trim().replace(/[^\w\- ]/g, "").replace(/\s+/g, "-").slice(0, 60);
const fileFor = (name) => path.join(NOTES_DIR, safeName(name) + ".md");

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean); // ["api","notes","name"]
  const name = parts[2] && decodeURIComponent(parts[2]);

  if (url.pathname === "/api/info") {
    return send(res, 200, { port: PORT, host: HOST, notesDir: NOTES_DIR, node: process.version });
  }

  if (parts[1] === "notes" && !name && req.method === "GET") {
    const list = fs.readdirSync(NOTES_DIR).filter((f) => f.endsWith(".md")).map((f) => ({
      name: f.replace(/\.md$/, ""),
      updated: fs.statSync(path.join(NOTES_DIR, f)).mtimeMs,
    }));
    return send(res, 200, list.sort((a, b) => b.updated - a.updated));
  }

  if (parts[1] === "notes" && name) {
    const file = fileFor(name);
    if (req.method === "GET") {
      if (!fs.existsSync(file)) return send(res, 404, { error: "Note not found" });
      return send(res, 200, { name: safeName(name), content: fs.readFileSync(file, "utf8") });
    }
    if (req.method === "PUT") {
      const { content = "" } = JSON.parse((await readBody(req)) || "{}");
      const isNew = !fs.existsSync(file);
      fs.writeFileSync(file, content);
      console.log(`[notes] ${isNew ? "CREATED" : "SAVED  "} ${path.basename(file)} (${content.length} chars)`);
      return send(res, 200, { ok: true, name: safeName(name) });
    }
    if (req.method === "DELETE") {
      if (fs.existsSync(file)) fs.unlinkSync(file);
      console.log(`[notes] DELETED ${path.basename(file)}`);
      return send(res, 200, { ok: true });
    }
  }
  send(res, 404, { error: "Unknown API route" });
}

const server = http.createServer(async (req, res) => {
  const start = Date.now();
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Log every request once it finishes: the heart of "what is a server doing?"
  res.on("finish", () => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method.padEnd(6)} ${url.pathname.padEnd(28)} ${res.statusCode}  ${Date.now() - start}ms  from ${req.socket.remoteAddress}`);
  });

  try {
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);

    // Everything else: serve files from /public
    const rel = url.pathname === "/" ? "index.html" : url.pathname;
    const file = path.join(PUBLIC_DIR, path.normalize(rel));
    if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file)) return send(res, 404, "Not found", "text/plain");
    send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || "application/octet-stream");
  } catch (err) {
    console.error("[error]", err.message);
    send(res, 500, { error: "Server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log("=======================================");
  console.log(` Notes server is running`);
  console.log(` Port:        ${PORT}`);
  console.log(` Listening on ${HOST} (all interfaces)`);
  console.log(` Notes saved: ${NOTES_DIR}`);
  console.log(` Local URL:   http://localhost:${PORT}`);
  console.log("=======================================");
});
