const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const USERS_FILE = path.join(ROOT, "users.json");
const MESSAGES_FILE = path.join(ROOT, "messages.json");

function ensureFile(file, fallback) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2), "utf8");
  }
}

function readJson(file, fallback) {
  try {
    ensureFile(file, fallback);
    const raw = fs.readFileSync(file, "utf8");
    return JSON.parse(raw || JSON.stringify(fallback));
  } catch (error) {
    console.error("Ошибка чтения:", file, error.message);
    return fallback;
  }
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("Ошибка записи:", file, error.message);
  }
}

ensureFile(USERS_FILE, []);
ensureFile(MESSAGES_FILE, []);

let users = readJson(USERS_FILE, []);
let messages = readJson(MESSAGES_FILE, []);

const sockets = new Map();

function send(ws, payload) {
  try {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  } catch (error) {
    console.error("Ошибка отправки:", error.message);
  }
}

function sanitizeText(value) {
  return String(value || "").trim();
}

function getUserById(id) {
  return users.find((u) => String(u.id) === String(id)) || null;
}

function nowParts() {
  const now = new Date();
  return {
    ts: now.getTime(),
    date: now.toLocaleDateString("ru-RU"),
    time: now.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit"
    })
  };
}

function upsertUser(phone, username) {
  let user = getUserById(phone);

  if (!user) {
    user = {
      id: phone,
      phone,
      username,
      createdAt: Date.now(),
      lastSeen: null,
      reads: {}
    };
    users.push(user);
  } else {
    user.phone = phone;
    user.username = username;
    if (!user.reads || typeof user.reads !== "object") {
      user.reads = {};
    }
  }

  writeJson(USERS_FILE, users);
  return user;
}

function getStatusText(user) {
  if (!user) return "неизвестно";
  if (sockets.has(user.id)) return "online";

  if (!user.lastSeen) return "offline";

  const d = new Date(user.lastSeen);
  return "last seen " + d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getUnreadCount(viewer, peerId) {
  const reads = viewer.reads || {};
  const readTs = Number(reads[peerId] || 0);

  return messages.filter((m) => {
    return (
      String(m.from) === String(peerId) &&
      String(m.to) === String(viewer.id) &&
      Number(m.ts || 0) > readTs
    );
  }).length;
}

function getDeliveryStatusFor(message, viewerId) {
  if (String(message.from) !== String(viewerId)) {
    return "";
  }

  const peer = getUserById(message.to);
  if (!peer) return "Sent";

  const peerReads = peer.reads || {};
  const peerReadTs = Number(peerReads[viewerId] || 0);

  if (peerReadTs >= Number(message.ts || 0)) {
    return "Read";
  }

  if (sockets.has(peer.id)) {
    return "Delivered";
  }

  return "Sent";
}

function buildUsersFor(viewerId) {
  const viewer = getUserById(viewerId);
  if (!viewer) return [];

  return users
    .filter((u) => String(u.id) !== String(viewerId))
    .map((u) => ({
      id: u.id,
      phone: u.phone,
      username: u.username,
      online: sockets.has(u.id),
      lastSeen: u.lastSeen,
      statusText: getStatusText(u),
      unreadCount: getUnreadCount(viewer, u.id)
    }));
}

function buildMessagesFor(viewerId) {
  return messages.map((m) => ({
    ...m,
    status: getDeliveryStatusFor(m, viewerId)
  }));
}

function sendUsersTo(userId) {
  const ws = sockets.get(userId);
  if (!ws) return;

  send(ws, {
    type: "users",
    users: buildUsersFor(userId)
  });
}

function sendHistoryTo(userId) {
  const ws = sockets.get(userId);
  if (!ws) return;

  send(ws, {
    type: "history",
    messages: buildMessagesFor(userId)
  });
}

function broadcastUsers() {
  for (const userId of sockets.keys()) {
    sendUsersTo(userId);
  }
}

function broadcastHistoryRefreshFor(userIds) {
  const uniq = [...new Set(userIds.map(String))];
  uniq.forEach((userId) => {
    const ws = sockets.get(userId);
    if (ws) {
      sendHistoryTo(userId);
      sendUsersTo(userId);
    }
  });
}

function markRead(userId, peerId) {
  const user = getUserById(userId);
  if (!user) return;

  if (!user.reads || typeof user.reads !== "object") {
    user.reads = {};
  }

  user.reads[peerId] = Date.now();
  writeJson(USERS_FILE, users);

  sendUsersTo(userId);
  sendHistoryTo(userId);

  const peerWs = sockets.get(peerId);
  if (peerWs) {
    sendHistoryTo(peerId);
    sendUsersTo(peerId);
  }
}

function handleRegister(ws, data) {
  const phone = sanitizeText(data.phone);
  const username = sanitizeText(data.username);

  if (!phone) {
    send(ws, { type: "error", message: "Введите номер телефона" });
    return;
  }

  if (!username) {
    send(ws, { type: "error", message: "Введите username" });
    return;
  }

  const user = upsertUser(phone, username);

  if (ws.userId && sockets.get(ws.userId) === ws) {
    sockets.delete(ws.userId);
  }

  ws.userId = user.id;
  sockets.set(user.id, ws);

  send(ws, {
    type: "registered",
    user: {
      id: user.id,
      phone: user.phone,
      username: user.username
    }
  });

  sendHistoryTo(user.id);
  sendUsersTo(user.id);
  broadcastUsers();
}

function handleMessage(ws, data) {
  if (!ws.userId) {
    send(ws, { type: "error", message: "Сначала войдите" });
    return;
  }

  const fromUser = getUserById(ws.userId);
  if (!fromUser) return;

  const to = sanitizeText(data.to);
  const kind = sanitizeText(data.kind) || "text";

  if (!to) {
    send(ws, { type: "error", message: "Не выбран получатель" });
    return;
  }

  const targetUser = getUserById(to);
  if (!targetUser) {
    send(ws, { type: "error", message: "Получатель не найден" });
    return;
  }

  const now = nowParts();

  const replyTo = data.replyTo
    ? messages.find((m) => String(m.id) === String(data.replyTo))
    : null;

  const message = {
    id: now.ts + Math.floor(Math.random() * 1000),
    from: fromUser.id,
    to,
    username: fromUser.username,
    kind,
    text: kind === "text" ? sanitizeText(data.text) : "",
    dataUrl: kind === "image" || kind === "voice" ? String(data.dataUrl || "") : "",
    fileName: sanitizeText(data.fileName || ""),
    date: now.date,
    time: now.time,
    ts: now.ts,
    edited: false,
    replyTo: replyTo
      ? {
          id: replyTo.id,
          username: replyTo.username,
          text: replyTo.kind === "text" ? replyTo.text : replyTo.kind === "image" ? "Фото" : "Голосовое",
          kind: replyTo.kind
        }
      : null
  };

  if (kind === "text" && !message.text) return;
  if ((kind === "image" || kind === "voice") && !message.dataUrl) return;

  messages.push(message);
  writeJson(MESSAGES_FILE, messages);

  broadcastHistoryRefreshFor([fromUser.id, to]);
}

function handleTyping(ws, data) {
  if (!ws.userId) return;

  const to = sanitizeText(data.to);
  if (!to) return;

  const fromUser = getUserById(ws.userId);
  const targetWs = sockets.get(to);

  if (!fromUser || !targetWs) return;

  send(targetWs, {
    type: "typing",
    from: fromUser.id,
    username: fromUser.username
  });
}

function handleRead(ws, data) {
  if (!ws.userId) return;

  const peerId = sanitizeText(data.peerId);
  if (!peerId) return;

  markRead(ws.userId, peerId);
}

function handleDelete(ws, data) {
  if (!ws.userId) return;

  const msg = messages.find((m) => String(m.id) === String(data.id));
  if (!msg) return;

  if (String(msg.from) !== String(ws.userId)) {
    send(ws, { type: "error", message: "Удалять можно только свои сообщения" });
    return;
  }

  messages = messages.filter((m) => String(m.id) !== String(data.id));
  writeJson(MESSAGES_FILE, messages);

  broadcastHistoryRefreshFor([msg.from, msg.to]);
}

function handleEdit(ws, data) {
  if (!ws.userId) return;

  const msg = messages.find((m) => String(m.id) === String(data.id));
  if (!msg) return;

  if (String(msg.from) !== String(ws.userId)) {
    send(ws, { type: "error", message: "Редактировать можно только свои сообщения" });
    return;
  }

  const text = sanitizeText(data.text);
  if (!text) {
    send(ws, { type: "error", message: "Текст не может быть пустым" });
    return;
  }

  if (msg.kind !== "text") {
    send(ws, { type: "error", message: "Редактировать можно только текстовые сообщения" });
    return;
  }

  msg.text = text;
  msg.edited = true;

  writeJson(MESSAGES_FILE, messages);
  broadcastHistoryRefreshFor([msg.from, msg.to]);
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

const server = http.createServer((req, res) => {
  let reqPath = req.url === "/" ? "/index.html" : req.url;

  if (reqPath.includes("..")) {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }

  const filePath = path.join(PUBLIC_DIR, reqPath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  ws.userId = null;

  ws.on("message", (raw) => {
    try {
      const data = JSON.parse(String(raw || "{}"));

      if (data.type === "register") {
        handleRegister(ws, data);
        return;
      }

      if (data.type === "message") {
        handleMessage(ws, data);
        return;
      }

      if (data.type === "typing") {
        handleTyping(ws, data);
        return;
      }

      if (data.type === "read") {
        handleRead(ws, data);
        return;
      }

      if (data.type === "delete") {
        handleDelete(ws, data);
        return;
      }

      if (data.type === "edit") {
        handleEdit(ws, data);
        return;
      }
    } catch (error) {
      console.error("Ошибка обработки WS:", error.message);
      send(ws, { type: "error", message: "Ошибка обработки данных" });
    }
  });

  ws.on("close", () => {
    if (ws.userId && sockets.get(ws.userId) === ws) {
      sockets.delete(ws.userId);

      const user = getUserById(ws.userId);
      if (user) {
        user.lastSeen = Date.now();
        writeJson(USERS_FILE, users);
      }

      broadcastUsers();

      for (const userId of sockets.keys()) {
        sendHistoryTo(userId);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log("Marsho server started on port", PORT);
});
