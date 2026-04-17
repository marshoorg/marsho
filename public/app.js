const ws = new WebSocket(
  (location.protocol === "https:" ? "wss://" : "ws://") + location.host
);

let me = null;
let selectedUserId = null;
let selectedUsername = "";
let selectedPhone = "";
let users = [];
let messages = [];

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

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
  const phone = phoneInput.value.trim();
  const username = usernameInput.value.trim();

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

  if (!file) {
    return;
  }

  if (file.size > 3 * 1024 * 1024) {
    alert("Фото слишком большое. До 3 МБ.");
    imageInput.value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = function () {
    if (ws.readyState !== 1) {
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
          if (ws.readyState !== 1) {
            alert("Соединение с сервером потеряно. Обновите страницу.");
            return;
          }

          ws.send(JSON.stringify({
            type: "message",
            kind: "voice",
            to: selectedUserId,
            dataUrl: reader.result,
            duration: 0,
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

function renderUsers() {
  usersDiv.innerHTML = "";

  const otherUsers = users.filter(function (user) {
    if (!me) {
      return true;
    }
    return user.id !== me.id;
  });

  if (otherUsers.length === 0) {
    usersDiv.innerHTML = "<div class='empty'>Пока никого нет онлайн</div>";
    return;
  }

  const prepared = otherUsers.map(function (user) {
    const dialogMessages = me ? getDialogMessages(user.id) : [];
    const last = dialogMessages.length ? dialogMessages[dialogMessages.length - 1] : null;

    let preview = "Сообщений пока нет";

    if (last) {
      if (last.kind === "text") {
        preview = last.text || "";
      } else if (last.kind === "image") {
        preview = "📷 Фото";
      } else if (last.kind === "voice") {
        preview = "🎤 Голосовое";
      }

      if (me && last.from === me.id) {
        preview = "Вы: " + preview;
      }
    }

    return {
      id: user.id,
      username: user.username,
      phone: user.phone,
      preview: preview,
      lastId: last ? last.id : 0
    };
  });

  prepared.sort(function (a, b) {
    return b.lastId - a.lastId;
  });

  prepared.forEach(function (user) {
    const div = document.createElement("div");
    div.className = user.id === selectedUserId ? "user-item active" : "user-item";

    div.innerHTML =
      "<div class='avatar'>" + getInitial(user.username) + "</div>" +
      "<div class='user-main'>" +
        "<div class='user-name'>" + escapeHtml(user.username) + "</div>" +
        "<div class='user-preview'>" + escapeHtml(user.preview) + "</div>" +
      "</div>";

    div.onclick = function () {
      selectedUserId = user.id;
      selectedUsername = user.username;
      selectedPhone = user.phone;

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
      "<div class='message-name'>" +
      escapeHtml(msg.username) +
      " • " +
      escapeHtml((msg.date || "") + " " + (msg.time || "")) +
      "</div>" +
      contentHtml;

    chatDiv.appendChild(div);
  });

  chatDiv.scrollTop = chatDiv.scrollHeight;
}

function getDialogMessages(userId) {
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
