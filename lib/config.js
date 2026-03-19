const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN is required");
}

function parseManagerIds() {
  const fromList = String(process.env.MANAGER_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Number(value))
    .filter(Number.isFinite);

  if (fromList.length > 0) {
    return [...new Set(fromList)];
  }

  const fallback = Number(process.env.ADMIN_ID);
  return Number.isFinite(fallback) ? [fallback] : [];
}

const MANAGER_IDS = parseManagerIds();
if (MANAGER_IDS.length === 0) {
  throw new Error("Set MANAGER_IDS or ADMIN_ID in .env");
}

module.exports = {
  BOT_TOKEN,
  MANAGER_IDS,
  PORT: Number(process.env.PORT || 8788),
  LISTEN_HOST: process.env.HOST || process.env.IP || "::",
  STORE_PATH: path.join(__dirname, "..", "channel-bindings.json"),
  MAX_FILE_MB: Number(process.env.MAX_FILE_MB || 500),
};
