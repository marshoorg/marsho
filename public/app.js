let ws = null;
let reconnectTimer = null;

let me = null;
let selectedUserId = null;
let users = [];
let messages = [];
let typingTimer = null;
let remoteTypingTimer = null;
let replyTo = null;
let currentMenuMessage = null;
let currentLongPressTimer = null;

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

const STORAGE_KEY = "marsho_auth_stable_v1";
const OPEN_CHAT_KEY = "marsho_open_chat_stable_v1";
const PROFILE_KEY = "marsho_profile_stable_v1";

const appShell = document.getElementById("appShell");
const authDiv = document.getElementById("auth");
const phoneInput = document.getElementById("phone");
const usernameInput = document.getElementById("username");
const searchInput = document.getElementById("searchInput");
const messageSearchInput = document.getElementById("messageSearchInput");
const msgInput = document.getElementById("msg");
msgInput.addEventListener("input", function () {
  const text = msgInput.value.trim();

  const sendBtn = document.querySelector(".tg-send-btn");
  const voiceBtn = document.querySelector(".tg-inner-voice-btn");

  if (!sendBtn || !voiceBtn) return;

  if (text.length > 0) {
    sendBtn.style.display = "flex";
    voiceBtn.style.display = "none";
  } else {
    sendBtn.style.display = "none";
    voiceBtn.style.display = "flex";
  }
});

setTimeout(() => {
  msgInput.dispatchEvent(new Event("input"));
}, 100);

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
const replyBar = document.getElementById("replyBar");
const replyTitle = document.getElementById("replyTitle");
const replyText = document.getElementById("replyText");
const viewer = document.getElementById("viewer");
const viewerImg = document.getElementById("viewerImg");
const messageMenu = document.getElementById("messageMenu");

const navChats = document.getElementById("navChats");
const navCalls = document.getElementById("navCalls");
const navProfile = document.getElementById("navProfile");
const navSettings = document.getElementById("navSettings");
const navChatsBadge = document.getElementById("navChatsBadge");


const profileAvatar = document.getElementById("profileAvatar");
const profileNameView = document.getElementById("profileNameView");
const profileBioView = document.getElementById("profileBioView");
const profileNameInput = document.getElementById("profileNameInput");
const profileBioInput = document.getElementById("profileBioInput");

let notifyAudio = null;
try {
  notifyAudio = new Audio("https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg");
} catch (e) {
  notifyAudio = null;
}

function wsUrl() {
 return (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/";
}

function connectWs() {
  console.log("WS: пытаюсь подключиться", wsUrl());

  ws = new WebSocket(wsUrl());

  ws.onopen = function () {
    console.log("WS: ОТКРЫТ");
    statusDiv.textContent = "Подключено";

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

  ws.onerror = function (e) {
    console.log("WS: ОШИБКА", e);
    statusDiv.textContent = "Ошибка подключения";
  };

  ws.onclose = function () {
    console.log("WS: ЗАКРЫТ");
    statusDiv.textContent = "Соединение закрыто";

    setTimeout(connectWs, 2000);
  };

  ws.onmessage = function (event) {
    const data = JSON.parse(event.data);

     if (data.type === "registered") {
      me = data.user;
      saveAuth(me.phone, me.username);
      authDiv.classList.add("hidden");
      statusDiv.textContent = "Вы вошли как " + me.username;

      const savedChat = localStorage.getItem(OPEN_CHAT_KEY);
      if (savedChat) {
        selectedUserId = savedChat;
      }

      syncProfileWithAuth();
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

    if (data.type === "typing") {
      if (selectedUserId && String(selectedUserId) === String(data.from)) {
        typingBar.textContent = data.username + " печатает...";
        if (remoteTypingTimer) clearTimeout(remoteTypingTimer);
        remoteTypingTimer = setTimeout(function () {
          typingBar.textContent = "";
        }, 1200);
      }
      return;
    }

    if (data.type === "error") {
      alert(data.message);
      return;
    }
  };
}

    statusDiv.textContent = "Статус: соединение закрыто";
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectWs, 1500);
  };

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

function saveOpenChat(userId) {
  if (userId) {
    localStorage.setItem(OPEN_CHAT_KEY, String(userId));
  } else {
    localStorage.removeItem(OPEN_CHAT_KEY);
  }
}

function getProfile() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
  } catch (e) {
    return null;
  }
}

function saveProfileData(data) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
}

function syncProfileWithAuth() {
  const saved = getProfile();
  const baseName = saved && saved.name ? saved.name : (me ? me.username : "Marsho User");
  const baseBio = saved && saved.bio ? saved.bio : "Тут будет твое био.";

  profileNameView.textContent = baseName;
  profileBioView.textContent = baseBio;
  profileNameInput.value = baseName;
  profileBioInput.value = baseBio;
  profileAvatar.textContent = getInitial(baseName);
  profileAvatar.style.background = avatarStyleById(baseName);
}

function loadProfileIntoInputs() {
  syncProfileWithAuth();
}

function saveProfile() {
  const name = String(profileNameInput.value || "").trim() || (me ? me.username : "Marsho User");
  const bio = String(profileBioInput.value || "").trim() || "Тут будет твое био.";

  saveProfileData({ name, bio });

  profileNameView.textContent = name;
  profileBioView.textContent = bio;
  profileAvatar.textContent = getInitial(name);
  profileAvatar.style.background = avatarStyleById(name);

  alert("Профиль сохранен");
}

function switchBottomTab(tab) {
  navChats.classList.remove("active");
  navProfile.classList.remove("active");
  navSettings.classList.remove("active");

  appShell.classList.remove("mobile-tab-profile", "mobile-tab-settings", "mobile-tab-calls");

  if (tab === "chats") {
    navChats.classList.add("active");
    return;
  }

  if (tab === "profile") {
    navProfile.classList.add("active");
    appShell.classList.add("mobile-tab-profile");
    return;
  }
  
  if (tab === "calls") {
  navCalls.classList.add("active");
  appShell.classList.add("mobile-tab-calls");
  return;
}

if (tab === "calls") {
  document.getElementById("callsScreen").style.display = "block";
}

  if (tab === "settings") {
    navSettings.classList.add("active");
    appShell.classList.add("mobile-tab-settings");
  }
}

function logoutUser() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(OPEN_CHAT_KEY);

  me = null;
  selectedUserId = null;
  users = [];
  messages = [];
  replyTo = null;

  authDiv.classList.remove("hidden");
  phoneInput.value = "";
  usernameInput.value = "";
  searchInput.value = "";
  messageSearchInput.value = "";
  msgInput.value = "";
  typingBar.textContent = "";
  topbarDiv.textContent = "Выберите пользователя";
  topSubDiv.textContent = "Откройте диалог слева";
  topAvatarDiv.textContent = "M";
  topAvatarDiv.style.background = "linear-gradient(135deg, #315a84, #4f8cff)";
  usersDiv.innerHTML = "<div class='empty'>Пока никого нет онлайн</div>";
  chatDiv.innerHTML = "<div class='empty'>Сначала войдите, затем выберите пользователя слева.</div>";
  clearReply();
  closeMessageMenu();
  goBackToUsers();
  switchBottomTab("chats");

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
    phone,
    username
  }));
}

function sendRead(peerId) {
  if (!ws || ws.readyState !== 1 || !peerId) return;

  ws.send(JSON.stringify({
    type: "read",
    peerId
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

  if (!text) return;

  if (!ws || ws.readyState !== 1) {
    alert("Соединение с сервером потеряно. Обновите страницу.");
    return;
  }

  ws.send(JSON.stringify({
    type: "message",
    kind: "text",
    text,
    to: selectedUserId,
    replyTo: replyTo ? replyTo.id : null
  }));

  msgInput.value = "";
  typingBar.textContent = "";
  clearReply();
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
      fileName: file.name,
      replyTo: replyTo ? replyTo.id : null
    }));

    clearReply();
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
            fileName: "voice.webm",
            replyTo: replyTo ? replyTo.id : null
          }));

          clearReply();
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

function togglePin(peerId, shouldPin) {
  if (!ws || ws.readyState !== 1) return;

  ws.send(JSON.stringify({
    type: "pin",
    peerId,
    action: shouldPin ? "pin" : "unpin"
  }));
}
// ===== NEW UI FUNCTIONS =====

function ripple(e) {
  const btn = e.currentTarget;
  const circle = document.createElement("span");
  const size = Math.max(btn.clientWidth, btn.clientHeight);

  circle.style.position = "absolute";
  circle.style.borderRadius = "50%";
  circle.style.background = "rgba(255,255,255,0.3)";
  circle.style.transform = "scale(0)";
  circle.style.animation = "ripple 0.5s linear";
  circle.style.width = size + "px";
  circle.style.height = size + "px";
  circle.style.left = e.offsetX - size / 2 + "px";
  circle.style.top = e.offsetY - size / 2 + "px";

  btn.appendChild(circle);

  setTimeout(() => {
    circle.remove();
  }, 500);
}

function fakeCall() {
  alert("📞 Звонки скоро будут");
}

function updateNavBadge() {
  let totalUnread = 0;

  users.forEach(function (u) {
    totalUnread += Number(u.unreadCount || 0);
  });

  if (totalUnread > 0) {
    navChatsBadge.textContent = totalUnread > 99 ? "99+" : String(totalUnread);
    navChatsBadge.classList.remove("hidden");
  } else {
    navChatsBadge.classList.add("hidden");
  }
}

function openNewChatPrompt() {
  if (!users.length) {
    alert("Пока нет пользователей");
    return;
  }

  const list = users.map(function (u, i) {
    return (i + 1) + ". " + u.username;
  }).join("\n");

  const value = prompt("Выбери номер пользователя:\n" + list);
  const num = Number(value);

  if (!num || num < 1 || num > users.length) return;

  const user = users[num - 1];
  selectedUserId = user.id;

  saveOpenChat(user.id);

  topbarDiv.textContent = "Чат с " + user.username;
  topSubDiv.textContent = user.statusText || "";
  const oldDot = topAvatarDiv.querySelector(".online-dot");
if (oldDot) oldDot.remove();

if (String(user.statusText || "").toLowerCase().includes("online")) {
  const dot = document.createElement("span");
  dot.className = "online-dot";
  topAvatarDiv.appendChild(dot);
}

  topAvatarDiv.textContent = getInitial(user.username);
  topAvatarDiv.style.background = avatarStyleById(user.id);

  switchBottomTab("chats");

  renderUsers();
  renderMessages();
  openMobileChat();
  sendRead(user.id);
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

function getDialogMessages(userId) {
  if (!me) return [];

  let dialog = messages.filter(function (msg) {
    return (
      (String(msg.from) === String(me.id) && String(msg.to) === String(userId)) ||
      (String(msg.from) === String(userId) && String(msg.to) === String(me.id))
    );
  });

  const q = String(messageSearchInput.value || "").trim().toLowerCase();
  if (q) {
    dialog = dialog.filter(function (msg) {
      const replyTextValue = msg.replyTo ? String(msg.replyTo.text || "") : "";
      return (
        String(msg.text || "").toLowerCase().includes(q) ||
        replyTextValue.toLowerCase().includes(q)
      );
    });
  }

  return dialog;
}

function getDialogMessagesRaw(userId) {
  if (!me) return [];

  return messages.filter(function (msg) {
    return (
      (String(msg.from) === String(me.id) && String(msg.to) === String(userId)) ||
      (String(msg.from) === String(userId) && String(msg.to) === String(me.id))
    );
  });
}

function getLastMessageFor(userId) {
  const dialogMessages = getDialogMessagesRaw(userId);
  return dialogMessages.length ? dialogMessages[dialogMessages.length - 1] : null;
}

function renderUsers() {
  usersDiv.innerHTML = "";
  updateNavBadge();

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
      if (last.kind === "image") preview = "Фото";
      if (last.kind === "voice") preview = "Голосовое";
      if (me && String(last.from) === String(me.id)) preview = "Вы: " + preview;
      lastTime = last.time || "";
    }

    return {
      ...user,
      preview,
      lastTime,
      sortTs: last ? Number(last.ts || 0) : 0
    };
  });

  prepared.sort(function (a, b) {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.sortTs - a.sortTs;
  });

  prepared.forEach(function (user) {
    const div = document.createElement("div");
    div.className = String(user.id) === String(selectedUserId) ? "user-item active" : "user-item";
    if (user.pinned) div.classList.add("pinned");

    div.innerHTML =
      "<div class='avatar' style='background:" + avatarStyleById(user.id) + "'>" +
        getInitial(user.username) +
      "</div>" +
      "<div class='user-main'>" +
        "<div class='user-top'>" +
          "<div class='user-name'>" +
            escapeHtml(user.username) +
            (user.pinned ? "<span class='pin-mark'>Pinned</span>" : "") +
          "</div>" +
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
      saveOpenChat(user.id);
      topbarDiv.textContent = "Чат с " + user.username;
      topSubDiv.textContent = user.statusText || "";
      topAvatarDiv.textContent = getInitial(user.username);
      topAvatarDiv.style.background = avatarStyleById(user.id);

      switchBottomTab("chats");
      renderUsers();
      renderMessages();
      openMobileChat();
      sendRead(user.id);
    };

    div.oncontextmenu = function (event) {
      event.preventDefault();
      openUserMenu(event.clientX, event.clientY, user);
    };

    attachLongPress(div, function (event) {
      openUserMenu(event.clientX || window.innerWidth / 2, event.clientY || window.innerHeight / 2, user);
    });

    usersDiv.appendChild(div);
  });
}

function updateTopbarStatus() {
  if (!selectedUserId) return;

  const user = users.find(function (u) {
    return String(u.id) === String(selectedUserId);
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

  let lastDateLabel = "";

  dialogMessages.forEach(function (msg) {
    const currentDateLabel = formatDateSeparator(msg.ts);

    if (currentDateLabel !== lastDateLabel) {
      lastDateLabel = currentDateLabel;
      const sep = document.createElement("div");
      sep.className = "date-sep";
      sep.textContent = currentDateLabel;
      chatDiv.appendChild(sep);
    }

    const div = document.createElement("div");
    div.className = String(msg.from) === String(me.id) ? "message mine" : "message";

    let contentHtml = "";

    if (msg.kind === "text") {
      contentHtml = "<div class='message-text'>" + escapeHtml(msg.text || "") + "</div>";
    } else if (msg.kind === "image") {
      contentHtml =
        "<div class='message-text'>Фото</div>" +
        "<img class='message-image' src='" + msg.dataUrl + "' alt='photo' />";
    } else if (msg.kind === "voice") {
      contentHtml =
        "<div class='message-text'>Голосовое</div>" +
        "<audio class='message-audio' controls src='" + msg.dataUrl + "'></audio>";
    }

    let replyHtml = "";
    if (msg.replyTo) {
      replyHtml =
        "<div class='message-reply'>" +
          "<div class='message-reply-name'>" + escapeHtml(msg.replyTo.username || "") + "</div>" +
          "<div>" + escapeHtml(msg.replyTo.text || "") + "</div>" +
        "</div>";
    }

    let infoHtml = "";
    const infoParts = [];

    if (msg.edited) infoParts.push("Edited");
    if (String(msg.from) === String(me.id) && msg.status) infoParts.push(msg.status);

  if (String(msg.from) === String(me.id)) {
  let statusMark = "✓";

  if (String(msg.status || "").toLowerCase().includes("read")) {
    statusMark = "✓✓";
  } else if (String(msg.status || "").toLowerCase().includes("delivered")) {
    statusMark = "✓✓";
  }

  infoHtml = "<div class='message-status'>" + escapeHtml(msg.time || "") + " " + statusMark + "</div>";
} else {
  infoHtml = "<div class='message-time'>" + escapeHtml(msg.time || "") + "</div>";
}

  div.innerHTML =
  "<div class='message-head'>" +
    "<div class='message-name'>" + escapeHtml(msg.username || "") + "</div>" +
  "</div>" +
  replyHtml +
  contentHtml +
  "<div class='message-time'>" + escapeHtml(msg.time || "") + "</div>" +
  infoHtml;


    const img = div.querySelector(".message-image");
    if (img) {
      img.onclick = function () {
        openImageViewer(msg.dataUrl);
      };
    }

    div.onclick = function (event) {
      if (event.target.tagName === "AUDIO" || event.target.tagName === "IMG") return;
      closeMessageMenu();
    };

    div.oncontextmenu = function (event) {
      event.preventDefault();
      openMessageMenu(event.clientX, event.clientY, msg);
    };

    attachLongPress(div, function (event) {
      openMessageMenu(event.clientX || window.innerWidth / 2, event.clientY || window.innerHeight / 2, msg);
    });

    chatDiv.appendChild(div);
  });

  chatDiv.scrollTop = chatDiv.scrollHeight;
}

function setReply(msg) {
  replyTo = msg;
  replyTitle.textContent = "Reply to " + (msg.username || "");
  replyText.textContent =
    msg.kind === "text"
      ? msg.text || ""
      : msg.kind === "image"
      ? "Фото"
      : "Голосовое";
  replyBar.classList.add("visible");
}

function clearReply() {
  replyTo = null;
  replyBar.classList.remove("visible");
  replyTitle.textContent = "Reply";
  replyText.textContent = "";
}

function deleteMessage(id) {
  closeMessageMenu();
  if (!confirm("Delete message?")) return;

  ws.send(JSON.stringify({
    type: "delete",
    id
  }));
}

function editMessage(id, oldText) {
  closeMessageMenu();
  const newText = prompt("Edit message:", oldText || "");
  if (!newText) return;

  ws.send(JSON.stringify({
    type: "edit",
    id,
    text: newText
  }));
}

function openImageViewer(src) {
  viewerImg.src = src;
  viewer.classList.add("visible");
}

function closeImageViewer() {
  viewer.classList.remove("visible");
  viewerImg.src = "";
}

function openMessageMenu(x, y, msg) {
  currentMenuMessage = msg;

  let html = "";
  html += "<button type='button' onclick='menuReply()'>Reply</button>";

  if (String(msg.from) === String(me.id) && msg.kind === "text") {
    html += "<button type='button' onclick='menuEdit()'>Edit</button>";
  }

  if (String(msg.from) === String(me.id)) {
    html += "<button type='button' onclick='menuDelete()'>Delete</button>";
  }

  messageMenu.innerHTML = html;
  messageMenu.style.left = Math.max(10, x - 20) + "px";
  messageMenu.style.top = Math.max(10, y - 20) + "px";
  messageMenu.classList.add("visible");
}

function openUserMenu(x, y, user) {
  const actionText = user.pinned ? "Unpin chat" : "Pin chat";

  messageMenu.innerHTML =
    "<button type='button' onclick='menuTogglePin(" + JSON.stringify(String(user.id)) + "," + JSON.stringify(!user.pinned) + ")'>" +
      actionText +
    "</button>";

  messageMenu.style.left = Math.max(10, x - 20) + "px";
  messageMenu.style.top = Math.max(10, y - 20) + "px";
  messageMenu.classList.add("visible");
}

function closeMessageMenu() {
  messageMenu.classList.remove("visible");
  messageMenu.innerHTML = "";
  currentMenuMessage = null;
}

function menuReply() {
  if (currentMenuMessage) setReply(currentMenuMessage);
  closeMessageMenu();
}

function menuEdit() {
  if (currentMenuMessage) editMessage(currentMenuMessage.id, currentMenuMessage.text);
}

function menuDelete() {
  if (currentMenuMessage) deleteMessage(currentMenuMessage.id);
}

function menuTogglePin(peerId, shouldPin) {
  togglePin(peerId, shouldPin);
  closeMessageMenu();
}

function attachLongPress(el, callback) {
  el.addEventListener("touchstart", function (event) {
    clearTimeout(currentLongPressTimer);
    const touch = event.touches[0];
    currentLongPressTimer = setTimeout(function () {
      callback({
        clientX: touch.clientX,
        clientY: touch.clientY
      });
    }, 450);
  });

  el.addEventListener("touchend", function () {
    clearTimeout(currentLongPressTimer);
  });

  el.addEventListener("touchmove", function () {
    clearTimeout(currentLongPressTimer);
  });
}

function formatDateSeparator(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();

  const sameYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();

  if (sameDay) return "Сегодня";
  if (sameYesterday) return "Вчера";

  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long"
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
    appShell.classList.add("mobile-chat-open");
    navChats.classList.add("active");
    navProfile.classList.remove("active");
    navSettings.classList.remove("active");
  }
}

function goBackToUsers() {
  appShell.classList.remove("mobile-chat-open");
}

searchInput.addEventListener("input", function () {
  renderUsers();
});

messageSearchInput.addEventListener("input", function () {
  renderMessages();
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

document.addEventListener("click", function (event) {
  const insideMenu = messageMenu.contains(event.target);
  if (!insideMenu) {
    closeMessageMenu();
  }
});

document.addEventListener("click", function () {
  if (notifyAudio) {
    notifyAudio.play().then(function () {
      notifyAudio.pause();
      notifyAudio.currentTime = 0;
    }).catch(function () {});
  }
}, { once: true });

syncProfileWithAuth();
switchBottomTab("chats");
connectWs();
