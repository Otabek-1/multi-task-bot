const fs = require("fs");
const { MANAGER_IDS, STORE_PATH } = require("./config");

function defaultStore() {
  return {
    managers: MANAGER_IDS,
    channels: {},
  };
}

function loadStore() {
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      managers: Array.isArray(parsed.managers) ? parsed.managers : MANAGER_IDS,
      channels: parsed.channels && typeof parsed.channels === "object" ? parsed.channels : {},
    };
  } catch {
    return defaultStore();
  }
}

let store = loadStore();

function saveStore() {
  store.managers = MANAGER_IDS;
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function refreshStore() {
  store = loadStore();
  store.managers = MANAGER_IDS;
  return store;
}

function ensureChannel(chat) {
  refreshStore();

  if (!chat || chat.type !== "channel") {
    return null;
  }

  const id = String(chat.id);
  const current = store.channels[id] || {};

  store.channels[id] = {
    chatId: chat.id,
    title: chat.title || current.title || "Untitled channel",
    username: chat.username || current.username || null,
    testIdentifier: current.testIdentifier || null,
    skill: current.skill || null,
    updatedAt: new Date().toISOString(),
  };

  saveStore();
  return store.channels[id];
}

function getChannelRows() {
  refreshStore();
  return Object.values(store.channels).sort((a, b) =>
    String(a.title || "").localeCompare(String(b.title || ""))
  );
}

function normalizeSkill(skill) {
  return String(skill || "").trim().toLowerCase();
}

function resolveTargetChannel(testIdentifier, skill) {
  const normalizedIdentifier = String(testIdentifier || "").trim();
  const normalizedSkill = normalizeSkill(skill);
  if (!normalizedIdentifier || !normalizedSkill) {
    return null;
  }

  return getChannelRows().find(
    (channel) =>
      String(channel.testIdentifier || "").trim() === normalizedIdentifier &&
      normalizeSkill(channel.skill) === normalizedSkill
  );
}

function bindChannel(chatId, testIdentifier, skill) {
  refreshStore();
  const channel = store.channels[String(chatId)];

  if (!channel) {
    return null;
  }

  channel.testIdentifier = String(testIdentifier).trim();
  channel.skill = normalizeSkill(skill);
  channel.updatedAt = new Date().toISOString();
  saveStore();
  return channel;
}

module.exports = {
  bindChannel,
  ensureChannel,
  getChannelRows,
  loadStore,
  normalizeSkill,
  refreshStore,
  resolveTargetChannel,
  saveStore,
  get store() {
    return store;
  },
};
