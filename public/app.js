let ws = null;
let reconnectTimer = null;

let me = null;
let selectedUserId = null;
let users = [];
let messages = [];
let typingTimer = null;
let remoteTypingTimer = null;

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

const STORAGE_KEY = "marsho_auth_v2";

const appDiv = document.getElementById("app");
const authDiv = document.getElementById("auth");
const phoneInput = document.getElementById("phone");
const usernameInput = document.getElementById("username");
const searchInput = document.getElementById("searchInput");
const msgInput = document.getElementById("msg");
const statusDiv = document.getElementById("status");
const typingBar = document.getElementById("typingBar");
const usersDiv = document.getElementById("users");
const chatDiv = document.getElementById("chat");
const topbarDiv = document.getElementById("topbar");
const topSubDiv = document.getElementById("topSub");
const topAvatarDiv = document.getElementById("topAvatar");
const imageInput = document.getElementById("imageInput");
const voiceBtn = document.getElementById("voiceBtn");
const recordHint = document.getElementById("recordHint");

function wsUrl() {
  return (location.protocol === "https:" ? "wss://" : "ws://") + location.host;
}

function connectWs() {
  ws = new WebSocket(wsUrl());

  ws.onopen = function () {
    statusDiv.textContent = "Статус: подключено к Marsho";

    const saved = loadSavedAuth();
    if (saved && saved.phone && saved.username) {
      phoneInput.value = saved.phone;
      usernameInput.value = saved.username;

      ws.send(JSON.stringify({
        type: "register",
        phone: saved.phone,
        username: saved.username
      }));
    }
  };

  ws.onerror = function () {
    statusDiv.textContent = "Статус: ошибка подключения";
  };

  ws.onclose = function () {
    statusDiv.textContent = "Статус: соединение закрыто";
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectWs, 1500);
  };

  ws.onmessage = function (event) {
    const data = JSON.parse(event.data);

    if (data.type === "registered") {
      me = data.user;
      saveAuth(me.phone, me.username);
      authDiv.classList.add("hidden");
      statusDiv.textContent = "Вы вошли как " + me.username;
      renderUsers();
      renderMessages();
      return;
    }

    if (data.type === "users") {
      users = data.users || [];
      renderUsers();
      updateTopbarStatus();
      return;
    }

    if (data.type === "history") {
      messages = data.messages || [];
      renderUsers();
      renderMessages();
      return;
    }

    if (data.type === "message") {
      messages.push(data.message);
      renderUsers();
      renderMessages();

      if (me && data.message.from !== me.id) {
        if (selectedUserId === data.message.from) {
          sendRead(data.message.from);
        }
      }
      return;
    }

    if (data.type === "typing") {
      if (selectedUserId === data.from) {
        typingBar.textContent = data.username + " печатает...";
        if (remoteTypingTimer) clearTimeout(remoteTypingTimer);
        remoteTypingTimer = setTimeout(function () {
          typingBar.textContent = "";
        }, 1400);
      }
      return;
    }

    if (data.type === "error") {
      alert(data.message);
    }
  };
}

function saveAuth(phone, username) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ phone, username }));
}

function loadSavedAuth() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch (e) {
    return null;
  }
}

function logoutUser() {
  localStorage.removeItem(STORAGE_KEY);
  me = null;
  selectedUserId = null;
  users = [];
  messages = [];
  authDiv.classList.remove("hidden");
  phoneInput.value = "";
  usernameInput.value = "";
  searchInput.value = "";
  msgInput.value = "";
  typingBar.textContent = "";
  topbarDiv.textContent = "Выберите пользователя";
  topSubDiv.textContent = "Откройте диалог слева";
  topAvatarDiv.textContent = "M";
  topAvatarDiv.style.background = "linear-gradient(135deg, #315a84, #4f8cff)";
  usersDiv.innerHTML = "<div class='empty'>Пока никого нет онлайн</div>";
  chatDiv.innerHTML = "<div class='empty'>Сначала войдите, затем выберите пользователя слева.</div>";
  goBackToUsers();

  if (ws && ws.readyState === 1) {
    ws.close();
  } else {
    connectWs();
  }
}

function registerUser() {
  const phone = String(phoneInput.value || "").trim();
  const username = String(usernameInput.value || "").trim();

  if (!phone) {
    alert("Введите номер телефона");
    return;
  }

  if (!username) {
    alert("Введите username");
    return;
  }

  if (!ws || ws.readyState !== 1) {
    alert("Соединение с сервером не готово. Обновите страницу.");
    return;
  }

  ws.send(JSON.stringify({
    type: "register",
    phone: phone,
    username: username
  }));
}

function sendRead(peerId) {
  if (!ws || ws.readyState !== 1 || !peerId) return;

  ws.send(JSON.stringify({
    type: "read",
    peerId: peerId
  }));
}

function sendTyping() {
  if (!me || !selectedUserId || !ws || ws.readyState !== 1) return;

  ws.send(JSON.stringify({
    type: "typing",
    to: selectedUserId
  }));
}

function sendMessage() {
  const text = String(msgInput.value || "").trim();

  if (!me) {
    alert("Сначала войдите");
    return;
  }

  if (!selectedUserId) {
    alert("Сначала выберите пользователя");
    return;
  }

  if (!text) {
    return;
  }

  if (!ws || ws.readyState !== 1) {
    alert("Соединение с сервером потеряно. Обновите страницу.");
    return;
  }

  ws.send(JSON.stringify({
    type: "message",
    kind: "text",
    text: text,
    to: selectedUserId
  }));

  msgInput.value = "";
  typingBar.textContent = "";
}

function pickImage() {
  if (!me) {
    alert("Сначала войдите");
    return;
  }

  if (!selectedUserId) {
    alert("Сначала выберите пользователя");
    return;
  }

  imageInput.click();
}

imageInput.addEventListener("change", function () {
  const file = imageInput.files[0];
  if (!file) return;

  if (file.size > 3 * 1024 * 1024) {
    alert("Фото слишком большое. До 3 МБ.");
    imageInput.value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = function () {
    if (!ws || ws.readyState !== 1) {
      alert("Соединение с сервером потеряно. Обновите страницу.");
      return;
    }

    ws.send(JSON.stringify({
      type: "message",
      kind: "image",
      to: selectedUserId,
      dataUrl: reader.result,
      fileName: file.name
    }));
  };

  reader.readAsDataURL(file);
  imageInput.value = "";
});

async function toggleRecording() {
  if (!me) {
    alert("Сначала войдите");
    return;
  }

  if (!selectedUserId) {
    alert("Сначала выберите пользователя");
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert("Запись не поддерживается на этом устройстве");
    return;
  }

  if (!isRecording) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream);
      isRecording = true;

      voiceBtn.textContent = "Стоп";
      voiceBtn.classList.remove("btn-ghost");
      voiceBtn.classList.add("btn-danger");
      recordHint.textContent = "Идёт запись...";

      mediaRecorder.ondataavailable = function (event) {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = function () {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        const reader = new FileReader();

        reader.onloadend = function () {
          if (!ws || ws.readyState !== 1) {
            alert("Соединение с сервером потеряно. Обновите страницу.");
            return;
          }

          ws.send(JSON.stringify({
            type: "message",
            kind: "voice",
            to: selectedUserId,
            dataUrl: reader.result,
            fileName: "voice.webm"
          }));
        };

        reader.readAsDataURL(audioBlob);

        stream.getTracks().forEach(function (track) {
          track.stop();
        });

        isRecording = false;
        voiceBtn.textContent = "Голосовое";
        voiceBtn.classList.remove("btn-danger");
        voiceBtn.classList.add("btn-ghost");
        recordHint.textContent = "Готов к записи";
      };

      mediaRecorder.start();
    } catch (error) {
      alert("Не удалось включить микрофон");
    }
  } else {
    mediaRecorder.stop();
  }
}

function avatarStyleById(id) {
  const colors = [
    ["#315a84", "#4f8cff"],
    ["#7c3aed", "#a78bfa"],
    ["#059669", "#34d399"],
    ["#ea580c", "#fb923c"],
    ["#be123c", "#fb7185"],
    ["#0f766e", "#2dd4bf"]
  ];

  const hash = String(id || "")
    .split("")
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);

  const pair = colors[hash % colors.length];
  return "linear-gradient(135deg, " + pair[0] + ", " + pair[1] + ")";
}

function getLastMessageFor(userId) {
  const dialogMessages = getDialogMessages(userId);
  return dialogMessages.length ? dialogMessages[dialogMessages.length - 1] : null;
}

function renderUsers() {
  usersDiv.innerHTML = "";

  let filtered = users.slice();

  const q = String(searchInput.value || "").trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(function (user) {
      return (
        String(user.username || "").toLowerCase().includes(q) ||
        String(user.phone || "").toLowerCase().includes(q)
      );
    });
  }

  if (filtered.length === 0) {
    usersDiv.innerHTML = "<div class='empty'>Пока никого нет онлайн</div>";
    return;
  }

  const prepared = filtered.map(function (user) {
    const last = getLastMessageFor(user.id);

    let preview = "Сообщений пока нет";
    let lastTime = "";

    if (last) {
      if (last.kind === "text") preview = last.text || "";
      if (last.kind === "image") preview = "📷 Фото";
      if (last.kind === "voice") preview = "🎤 Голосовое";
      if (me && last.from === me.id) preview = "Вы: " + preview;
      lastTime = last.time || "";
    }

    return {
      ...user,
      preview,
      lastTime,
      sortTs: last ? last.ts : 0
    };
  });

  prepared.sort(function (a, b) {
    return b.sortTs - a.sortTs;
  });

  prepared.forEach(function (user) {
    const div = document.createElement("div");
    div.className = user.id === selectedUserId ? "user-item active" : "user-item";

    div.innerHTML =
      "<div class='avatar' style='background:" + avatarStyleById(user.id) + "'>" +
        getInitial(user.username) +
      "</div>" +
      "<div class='user-main'>" +
        "<div class='user-top'>" +
          "<div class='user-name'>" + escapeHtml(user.username) + "</div>" +
          "<div style='display:flex;align-items:center;gap:8px;'>" +
            (user.unreadCount > 0 ? "<span class='badge'>" + user.unreadCount + "</span>" : "") +
            "<div class='user-time'>" + escapeHtml(user.lastTime || "") + "</div>" +
          "</div>" +
        "</div>" +
        "<div class='user-preview'>" + escapeHtml(user.preview) + "</div>" +
        "<div class='user-status'>" + escapeHtml(user.statusText || "") + "</div>" +
      "</div>";

    div.onclick = function () {
      selectedUserId = user.id;
      topbarDiv.textContent = "Чат с " + user.username;
      topSubDiv.textContent = user.statusText || "";
      topAvatarDiv.textContent = getInitial(user.username);
      topAvatarDiv.style.background = avatarStyleById(user.id);

      renderUsers();
      renderMessages();
      openMobileChat();
      sendRead(user.id);
    };

    usersDiv.appendChild(div);
  });
}

function updateTopbarStatus() {
  if (!selectedUserId) return;

  const user = users.find(function (u) {
    return u.id === selectedUserId;
  });

  if (user) {
    topSubDiv.textContent = user.statusText || "";
  }
}

function renderMessages() {
  chatDiv.innerHTML = "";

  if (!me) {
    chatDiv.innerHTML = "<div class='empty'>Сначала войдите</div>";
    return;
  }

  if (!selectedUserId) {
    chatDiv.innerHTML = "<div class='empty'>Выберите пользователя слева</div>";
    return;
  }

  const dialogMessages = getDialogMessages(selectedUserId);

  if (dialogMessages.length === 0) {
    chatDiv.innerHTML = "<div class='empty'>Сообщений пока нет. Напишите первым.</div>";
    return;
  }

  dialogMessages.forEach(function (msg) {
    const div = document.createElement("div");
    div.className = msg.from === me.id ? "message mine" : "message";

    let contentHtml = "";

    if (msg.kind === "text") {
      contentHtml = "<div class='message-text'>" + escapeHtml(msg.text) + "</div>";
    } else if (msg.kind === "image") {
      contentHtml =
        "<div class='message-text'>Фото</div>" +
        "<img class='message-image' src='" + msg.dataUrl + "' alt='photo' />";
    } else if (msg.kind === "voice") {
      contentHtml =
        "<div class='message-text'>Голосовое</div>" +
        "<audio class='message-audio' controls src='" + msg.dataUrl + "'></audio>";
    }

    div.innerHTML =
      "<div class='message-head'>" +
        "<div class='message-name'>" + escapeHtml(msg.username || "") + "</div>" +
        "<div class='message-time'>" + escapeHtml((msg.date || "") + " " + (msg.time || "")) + "</div>" +
      "</div>" +
      contentHtml;

    chatDiv.appendChild(div);
  });

  chatDiv.scrollTop = chatDiv.scrollHeight;
}

function getDialogMessages(userId) {
  if (!me) return [];

  return messages.filter(function (msg) {
    return (
      (msg.from === me.id && msg.to === userId) ||
      (msg.from === userId && msg.to === me.id)
    );
  });
}

function getInitial(name) {
  return String(name || "?").trim().charAt(0).toUpperCase();
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;");
}

function openMobileChat() {
  if (window.innerWidth <= 700) {
    appDiv.classList.add("mobile-chat-open");
  }
}

function goBackToUsers() {
  appDiv.classList.remove("mobile-chat-open");
}

searchInput.addEventListener("input", function () {
  renderUsers();
});

msgInput.addEventListener("input", function () {
  if (!selectedUserId) return;
  sendTyping();

  if (typingTimer) clearTimeout(typingTimer);
  typingTimer = setTimeout(function () {
    typingBar.textContent = "";
  }, 900);
});

msgInput.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    sendMessage();
  }
});

document.addEventListener("visibilitychange", function () {
  if (!document.hidden && selectedUserId) {
    sendRead(selectedUserId);
  }
});

connectWs();
