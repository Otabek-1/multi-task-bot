const express = require("express");
const multer = require("multer");
const { Telegraf, Input } = require("telegraf");
const { BOT_TOKEN, LISTEN_HOST, MANAGER_IDS, MAX_FILE_MB, PORT } = require("./lib/config");
const { bindChannel, getChannelRows, normalizeSkill, refreshStore, resolveTargetChannel } = require("./lib/store");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024 },
});

const telegram = new Telegraf(BOT_TOKEN).telegram;
const app = express();

app.use(express.json({ limit: "10mb" }));

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "multi-channel-bot-http",
    managers: MANAGER_IDS,
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    managers: MANAGER_IDS,
    channels: getChannelRows().length,
  });
});

app.get("/channels", (req, res) => {
  refreshStore();
  res.json({
    ok: true,
    channels: getChannelRows(),
  });
});

async function sendPayloadToChannel({ channel, caption, text, file }) {
  if (file) {
    return telegram.sendDocument(
      channel.chatId,
      Input.fromBuffer(file.buffer, file.originalname || "result.bin"),
      {
        caption: caption || text || undefined,
        parse_mode: "HTML",
      }
    );
  }

  const message = text || caption;
  if (!message) {
    throw new Error("text_or_file_required");
  }

  return telegram.sendMessage(channel.chatId, message, {
    parse_mode: "HTML",
  });
}

app.post("/send-result", upload.single("file"), async (req, res) => {
  try {
    refreshStore();
    const testIdentifier = String(req.body?.testIdentifier || "").trim();
    const skill = normalizeSkill(req.body?.skill);
    if (!testIdentifier || !skill) {
      return res.status(400).json({
        ok: false,
        error: "testIdentifier and skill are required",
      });
    }

    const channel = resolveTargetChannel(testIdentifier, skill);
    if (!channel) {
      return res.status(404).json({
        ok: false,
        error: "channel_not_found_for_testIdentifier_and_skill",
      });
    }

    const caption = req.body?.caption ? String(req.body.caption) : "";
    const text = req.body?.text ? String(req.body.text) : "";

    const telegramResponse = await sendPayloadToChannel({
      channel,
      caption,
      text,
      file: req.file || null,
    });

    return res.json({
      ok: true,
      routedTo: {
        chatId: channel.chatId,
        title: channel.title,
        testIdentifier: channel.testIdentifier,
        skill: channel.skill,
      },
      telegramMessageId: telegramResponse.message_id,
    });
  } catch (error) {
    console.error("POST /send-result failed:", error);
    return res.status(500).json({
      ok: false,
      error: error.message || "internal_error",
    });
  }
});

app.post("/bind-channel", async (req, res) => {
  const chatId = String(req.body?.chatId || "").trim();
  const testIdentifier = String(req.body?.testIdentifier || "").trim();
  const skill = normalizeSkill(req.body?.skill);

  if (!chatId || !testIdentifier || !skill) {
    return res.status(400).json({
      ok: false,
      error: "chatId, testIdentifier and skill are required",
    });
  }

  const channel = bindChannel(chatId, testIdentifier, skill);
  if (!channel) {
    return res.status(404).json({ ok: false, error: "channel_not_found" });
  }

  return res.json({ ok: true, channel });
});

app.listen(PORT, LISTEN_HOST, () => {
  console.log(`HTTP service listening on ${LISTEN_HOST}:${PORT}`);
});
