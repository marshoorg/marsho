alert("APP JS LOADED");

const ws = new WebSocket(
  (location.protocol === "https:" ? "wss://" : "ws://") + location.host
);

let me = null;
let selectedUserId = null;
let users = [];
let messages = [];

const appDiv = document.getElementById("app");
const phoneInput = document.getElementById("phone");
const usernameInput = document.getElementById("username");
const msgInput = document.getElementById("msg");
const statusDiv = document.getElementById("status");
const usersDiv = document.getElementById("users");
const chatDiv = document.getElementById("chat");
const topbarDiv = document.getElementById("topbar");
const topSubDiv = document.getElementById("topSub");
const topAvatarDiv = document.getElementById("topAvatar");
const imageInput = document.getElementById("imageInput");
const voiceBtn = document.getElementById("voiceBtn");
const recordHint = document.getElementById("recordHint");

ws.onopen = function () {
  statusDiv.textContent = "Статус: подключено к Marsho";
};

ws.onerror = function () {
  statusDiv.textContent = "Статус: ошибка подключения";
};

ws.onclose = function () {
  statusDiv.textContent = "Статус: соединение закрыто";
};

ws.onmessage = function (event) {
  const data = JSON.parse(event.data);

  if (data.type === "registered") {
    me = data.user;
    statusDiv.textContent = "Вы вошли как " + me.username;
    renderUsers();
    renderMessages();
    return;
  }

  if (data.type === "users") {
    users = data.users || [];
    renderUsers();
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
    return;
  }

  if (data.type === "error") {
    alert(data.message);
  }
};

function registerUser() {
  const phoneField = document.getElementById("phone");
  const usernameField = document.getElementById("username");

  if (!phoneField) {
    alert('Не найден input с id="phone"');
    return;
  }

  if (!usernameField) {
    alert('Не найден input с id="username"');
    return;
  }

  const phone = String(phoneField.value || "").trim();
  const username = String(usernameField.value || "").trim();

  if (!phone) {
    alert("Введите номер телефона");
    return;
  }

  if (!username) {
    alert("Введите username");
    return;
  }

  if (ws.readyState !== 1) {
    alert("Соединение с сервером не готово. Обновите страницу.");
    return;
  }

  ws.send(JSON.stringify({
    type: "register",
    phone: phone,
    username: username
  }));
}

function sendMessage() {
  const text = msgInput.value.trim();

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

  if (ws.readyState !== 1) {
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
}

function pickImage() {
  alert("Фото пока выключено для проверки");
}

function toggleRecording() {
  alert("Голосовое пока выключено для проверки");
}

function renderUsers() {
  usersDiv.innerHTML = "";

  const otherUsers = users.filter(function (user) {
    if (!me) return true;
    return user.id !== me.id;
  });

  if (otherUsers.length === 0) {
    usersDiv.innerHTML = "<div class='empty'>Пока никого нет онлайн</div>";
    return;
  }

  otherUsers.forEach(function (user) {
    const div = document.createElement("div");
    div.className = user.id === selectedUserId ? "user-item active" : "user-item";

    div.innerHTML =
      "<div class='avatar'>" + getInitial(user.username) + "</div>" +
      "<div class='user-main'>" +
      "<div class='user-name'>" + escapeHtml(user.username) + "</div>" +
      "<div class='user-preview'>Нажмите, чтобы открыть чат</div>" +
      "</div>";

    div.onclick = function () {
      selectedUserId = user.id;
      topbarDiv.textContent = "Чат с " + user.username;
      topSubDiv.textContent = "Номер: " + user.phone;
      topAvatarDiv.textContent = getInitial(user.username);
      renderUsers();
      renderMessages();
      openMobileChat();
    };

    usersDiv.appendChild(div);
  });
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

  const dialogMessages = messages.filter(function (msg) {
    return (
      (msg.from === me.id && msg.to === selectedUserId) ||
      (msg.from === selectedUserId && msg.to === me.id)
    );
  });

  if (dialogMessages.length === 0) {
    chatDiv.innerHTML = "<div class='empty'>Сообщений пока нет. Напишите первым.</div>";
    return;
  }

  dialogMessages.forEach(function (msg) {
    const div = document.createElement("div");
    div.className = msg.from === me.id ? "message mine" : "message";
    div.innerHTML =
      "<div class='message-name'>" + escapeHtml(msg.username || "") + "</div>" +
      "<div class='message-text'>" + escapeHtml(msg.text || "") + "</div>";
    chatDiv.appendChild(div);
  });

  chatDiv.scrollTop = chatDiv.scrollHeight;
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
