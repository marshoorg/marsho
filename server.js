const http = require("http");
const fs = require("fs");
const path = require("path");
const express = require("express");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const USERS_FILE = path.join(__dirname, "users.json");
const MESSAGES_FILE = path.join(__dirname, "messages.json");

let users = [];
let messages = [];
const clients = new Map();

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(fallback, null, 2), "utf8");
      return fallback;
    }

    const text = fs.readFileSync(file, "utf8");
    return JSON.parse(text);
  } catch (error) {
    console.log("Ошибка чтения:", file, error.message);
    return fallback;
  }
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.log("Ошибка записи:", file, error.message);
  }
}

function loadData() {
  users = readJson(USERS_FILE, []);
  messages = readJson(MESSAGES_FILE, []);
}

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(data) {
  wss.clients.forEach(function (client) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

function broadcastUsers() {
  const onlineUsers = [];

  clients.forEach(function (user) {
    onlineUsers.push({
      id: user.id,
      phone: user.phone,
      username: user.username
    });
  });

  broadcast({
    type: "users",
    users: onlineUsers
  });
}

function getUserByPhone(phone) {
  return users.find(function (u) {
    return u.phone === phone;
  });
}

function getUserById(id) {
  return users.find(function (u) {
    return u.id === id;
  });
}

function createMessage(currentUser, data) {
  const now = new Date();

  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    from: currentUser.id,
    to: Number(data.to),
    username: currentUser.username,
    kind: data.kind || "text",
    text: data.text || "",
    fileName: data.fileName || "",
    dataUrl: data.dataUrl || "",
    duration: data.duration || 0,
    time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    date: now.toLocaleDateString("ru-RU")
  };
}

function getHistoryForUser(userId) {
  return messages.filter(function (m) {
    return m.from === userId || m.to === userId;
  });
}

loadData();

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", function (ws) {
  console.log("Клиент подключился");

  ws.on("message", function (raw) {
    let data;

    try {
      data = JSON.parse(raw.toString());
    } catch (error) {
      send(ws, {
        type: "error",
        message: "Неверный формат данных"
      });
      return;
    }

    if (data.type === "register") {
      const phone = String(data.phone || "").trim();
      const username = String(data.username || "").trim();

      if (!phone) {
        send(ws, {
          type: "error",
          message: "Введите номер телефона"
        });
        return;
      }

      if (!username) {
        send(ws, {
          type: "error",
          message: "Введите username"
        });
        return;
      }

      let user = getUserByPhone(phone);

      if (!user) {
        user = {
          id: Date.now(),
          phone: phone,
          username: username
        };

        users.push(user);
      } else {
        user.username = username;
      }

      writeJson(USERS_FILE, users);
      clients.set(ws, user);

      send(ws, {
        type: "registered",
        user: user
      });

      send(ws, {
        type: "history",
        messages: getHistoryForUser(user.id)
      });

      broadcastUsers();
      return;
    }

    if (data.type === "message") {
      const currentUser = clients.get(ws);

      if (!currentUser) {
        send(ws, {
          type: "error",
          message: "Сначала войдите"
        });
        return;
      }

      const recipientId = Number(data.to);

      if (!recipientId) {
        send(ws, {
          type: "error",
          message: "Сначала выберите пользователя"
        });
        return;
      }

      const recipient = getUserById(recipientId);

      if (!recipient) {
        send(ws, {
          type: "error",
          message: "Получатель не найден"
        });
        return;
      }

      const kind = data.kind || "text";

      if (kind === "text") {
        const text = String(data.text || "").trim();

        if (!text) {
          return;
        }
      }

      if ((kind === "image" || kind === "voice") && !data.dataUrl) {
        send(ws, {
          type: "error",
          message: "Файл не передан"
        });
        return;
      }

      const msg = createMessage(currentUser, data);
      messages.push(msg);
      writeJson(MESSAGES_FILE, messages);

      broadcast({
        type: "message",
        message: msg
      });

      return;
    }
  });

  ws.on("close", function () {
    clients.delete(ws);
    broadcastUsers();
  });
});

server.listen(PORT, function () {
  console.log("Сервер работает: http://localhost:" + PORT);
});
