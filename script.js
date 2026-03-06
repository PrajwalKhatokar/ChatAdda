const API_URL = "https://router.huggingface.co/v1/chat/completions";
const HF_TOKEN = "YOUR_HUGGINGFACE_TOKEN"; // Replace with your real token
const MODEL = "Qwen/Qwen3.5-27B:novita";
const MAX_TOKENS = 60;
const TEMPERATURE = 0.1;
const REQUEST_TIMEOUT_MS = 25000;
const SPEED_SYSTEM_PROMPT =
  "You are a concise assistant. Reply in 1-2 short sentences.";
const CHAT_STORAGE_KEY = "chatadda_chats_v1";
const CURRENT_CHAT_KEY = "chatadda_current_chat_v1";

const chat = document.getElementById("chat");
const main = document.querySelector(".main");
const form = document.getElementById("chat-form");
const input = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const newChatBtn = document.getElementById("new-chat-btn");
const chatHistory = document.getElementById("chat-history");

let chats = [];
let currentChatId = null;

function addMessage(role, text) {
  const div = document.createElement("div");
  div.className = `message ${role}`;
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

function saveState() {
  localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chats));
  if (currentChatId) {
    localStorage.setItem(CURRENT_CHAT_KEY, currentChatId);
  } else {
    localStorage.removeItem(CURRENT_CHAT_KEY);
  }
}

function loadState() {
  try {
    const storedChats = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || "[]");
    chats = Array.isArray(storedChats) ? storedChats : [];
  } catch (error) {
    chats = [];
  }
  currentChatId = localStorage.getItem(CURRENT_CHAT_KEY);
}

function getCurrentChat() {
  return chats.find((item) => item.id === currentChatId) || null;
}

function getChatById(chatId) {
  return chats.find((item) => item.id === chatId) || null;
}

function applyModeForMessages(messages) {
  if (messages.length > 0) {
    main.classList.add("chat-mode");
  } else {
    main.classList.remove("chat-mode");
  }
}

function renderMessages() {
  const currentChat = getCurrentChat();
  const messages = currentChat?.messages || [];
  chat.innerHTML = "";
  for (const message of messages) {
    addMessage(message.role, message.content);
  }
  applyModeForMessages(messages);
}

function renderHistory() {
  chatHistory.innerHTML = "";

  if (chats.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-history";
    li.textContent = "No chats yet";
    chatHistory.appendChild(li);
    return;
  }

  for (const item of chats) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chat-item-btn";
    if (item.id === currentChatId) {
      btn.classList.add("active");
    }
    btn.textContent = item.title || "New chat";
    btn.addEventListener("click", () => {
      currentChatId = item.id;
      saveState();
      renderHistory();
      renderMessages();
    });
    li.appendChild(btn);
    chatHistory.appendChild(li);
  }
}

function createChat() {
  const chatItem = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: "New chat",
    messages: [],
  };
  chats.unshift(chatItem);
  currentChatId = chatItem.id;
  saveState();
  renderHistory();
  renderMessages();
  input.focus();
}

function updateTitleIfNeeded(chatItem) {
  if (!chatItem || chatItem.title !== "New chat") return;
  const firstUserMessage = chatItem.messages.find((m) => m.role === "user");
  if (!firstUserMessage) return;

  const trimmed = firstUserMessage.content.trim();
  if (!trimmed) return;
  chatItem.title = trimmed.slice(0, 28) + (trimmed.length > 28 ? "..." : "");
}

function addMessageToChat(chatId, role, content) {
  const chatItem = getChatById(chatId);
  if (!chatItem) return;
  chatItem.messages.push({ role, content });
  updateTitleIfNeeded(chatItem);
  saveState();
}

async function getAIReply(userMessage) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        messages: [
          {
            role: "system",
            content: SPEED_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: userMessage,
          },
        ],
      }),
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "No response received.";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const userMessage = input.value.trim();
  if (!userMessage) return;
  if (!HF_TOKEN || HF_TOKEN === "YOUR_HUGGINGFACE_TOKEN") {
    main.classList.add("chat-mode");
    addMessage("user", userMessage);
    addMessage(
      "ai",
      "Error: Add your Hugging Face token in script.js (HF_TOKEN) and refresh."
    );
    input.value = "";
    return;
  }

  if (!getCurrentChat()) {
    createChat();
  }

  const activeChatId = currentChatId;
  addMessageToChat(activeChatId, "user", userMessage);
  renderHistory();
  applyModeForMessages(getCurrentChat().messages);
  addMessage("user", userMessage);
  input.value = "";
  input.focus();

  sendBtn.disabled = true;
  const thinkingMessage = addMessage("ai", "Thinking...");

  try {
    const aiReply = await getAIReply(userMessage);
    thinkingMessage.textContent = aiReply;
    addMessageToChat(activeChatId, "ai", aiReply);
  } catch (error) {
    if (error.name === "AbortError") {
      thinkingMessage.textContent =
        "Error: request timed out. Try a shorter prompt or a faster model.";
    } else {
      thinkingMessage.textContent = `Error: ${error.message}`;
    }
    addMessageToChat(activeChatId, "ai", thinkingMessage.textContent);
  } finally {
    sendBtn.disabled = false;
    renderHistory();
    renderMessages();
  }
});

newChatBtn.addEventListener("click", () => {
  createChat();
});

loadState();

if (chats.length === 0) {
  renderHistory();
  renderMessages();
} else {
  const existing = chats.find((item) => item.id === currentChatId);
  currentChatId = existing ? existing.id : chats[0].id;
  saveState();
  renderHistory();
  renderMessages();
}
