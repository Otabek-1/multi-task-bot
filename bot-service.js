const { Telegraf, Markup, session } = require("telegraf");
const { BOT_TOKEN, MANAGER_IDS } = require("./lib/config");
const storeModule = require("./lib/store");

const { bindChannel, ensureChannel, getChannelRows, refreshStore } = storeModule;

const SKILLS = ["listening", "reading", "writing", "speaking"];

function isManager(userId) {
  return MANAGER_IDS.includes(Number(userId));
}

function buildChannelListText() {
  const channels = getChannelRows();
  if (channels.length === 0) {
    return [
      "Bot admin bo'lgan kanal topilmadi.",
      "Botni kanalga admin qiling va kanalga bitta post yuboring.",
    ].join("\n");
  }

  return channels
    .map((channel, index) => {
      const handle = channel.username ? `@${channel.username}` : channel.chatId;
      const identifier = channel.testIdentifier || "biriktirilmagan";
      const skill = channel.skill || "biriktirilmagan";
      return `${index + 1}. ${channel.title}\nID: ${handle}\nTest identifier: ${identifier}\nSkill: ${skill}`;
    })
    .join("\n\n");
}

function buildChannelKeyboard() {
  const rows = getChannelRows()
    .filter((channel) => !channel.testIdentifier || !channel.skill)
    .map((channel) => [
      Markup.button.callback(`${channel.title} ni biriktirish`, `bind:${channel.chatId}`),
    ]);

  if (rows.length === 0) {
    rows.push([Markup.button.callback("Yangilash", "refresh_channels")]);
  }

  return Markup.inlineKeyboard(rows);
}

async function showChannelList(ctx, extraText = "") {
  const text = [extraText.trim(), buildChannelListText()].filter(Boolean).join("\n\n");
  await ctx.reply(text, buildChannelKeyboard());
}

async function safeEditChannelList(ctx, text) {
  try {
    await ctx.editMessageText(text, buildChannelKeyboard());
  } catch (error) {
    const description = error?.response?.description || "";
    if (description.includes("message is not modified")) {
      await ctx.answerCbQuery("O'zgarish yo'q");
      return;
    }
    throw error;
  }
}

const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

bot.use(async (ctx, next) => {
  const chat = ctx.chat || ctx.update?.channel_post?.chat || ctx.update?.my_chat_member?.chat;
  if (chat?.type === "channel") {
    ensureChannel(chat);
  }
  return next();
});

bot.start(async (ctx) => {
  if (!isManager(ctx.from?.id)) {
    return ctx.reply("Siz manager emassiz.");
  }

  return ctx.reply("Boshqaruv menyusi.", Markup.keyboard([["Channel list"]]).resize());
});

bot.hears("Channel list", async (ctx) => {
  if (!isManager(ctx.from?.id)) {
    return ctx.reply("Siz manager emassiz.");
  }

  return showChannelList(ctx);
});

bot.action("refresh_channels", async (ctx) => {
  if (!isManager(ctx.from?.id)) {
    await ctx.answerCbQuery("Ruxsat yo'q");
    return;
  }

  await ctx.answerCbQuery("Yangilandi");
  await safeEditChannelList(ctx, buildChannelListText());
});

bot.action(/^bind:(-?\d+)$/, async (ctx) => {
  if (!isManager(ctx.from?.id)) {
    await ctx.answerCbQuery("Ruxsat yo'q");
    return;
  }

  refreshStore();
  const chatId = ctx.match[1];
  const channel = storeModule.store.channels[chatId];

  if (!channel) {
    await ctx.answerCbQuery("Kanal topilmadi");
    return;
  }

  ctx.session = ctx.session || {};
  ctx.session.pendingBind = { chatId, step: "identifier" };
  await ctx.answerCbQuery();
  await ctx.reply(`${channel.title} uchun test identifier ni yuboring. Masalan: super-edu`);
});

bot.on("text", async (ctx, next) => {
  if (!isManager(ctx.from?.id)) {
    return next();
  }

  const pendingBind = ctx.session?.pendingBind;
  if (!pendingBind) {
    return next();
  }

  const identifier = ctx.message.text.trim();
  if (!identifier || identifier === "Channel list") {
    return ctx.reply("Yaroqli qiymat yuboring.");
  }

  if (pendingBind.step === "identifier") {
    ctx.session.pendingBind = {
      chatId: pendingBind.chatId,
      step: "skill",
      testIdentifier: identifier,
    };
    return ctx.reply(
      `Endi skill yuboring: ${SKILLS.join(", ")}`
    );
  }

  if (pendingBind.step !== "skill") {
    ctx.session.pendingBind = null;
    return next();
  }

  const skill = identifier.toLowerCase();
  if (!SKILLS.includes(skill)) {
    return ctx.reply(`Skill noto'g'ri. Faqat shulardan biri bo'lsin: ${SKILLS.join(", ")}`);
  }

  const channel = bindChannel(pendingBind.chatId, pendingBind.testIdentifier, skill);
  ctx.session.pendingBind = null;

  if (!channel) {
    return ctx.reply("Kanal topilmadi.");
  }

  await ctx.reply(`Biriktirildi: ${channel.title} -> ${pendingBind.testIdentifier} / ${skill}`);
  await showChannelList(ctx);
});

bot.on("my_chat_member", async (ctx) => {
  const chat = ctx.update.my_chat_member?.chat;
  if (chat?.type !== "channel") {
    return;
  }

  const entry = ensureChannel(chat);
  const status = ctx.update.my_chat_member?.new_chat_member?.status;

  if (!entry || (status !== "administrator" && status !== "member")) {
    return;
  }

  for (const managerId of MANAGER_IDS) {
    try {
      await bot.telegram.sendMessage(
        managerId,
        `Yangi kanal aniqlandi: ${entry.title}\nID: ${entry.chatId}`
      );
    } catch {
      // Manager chat ochmagan bo'lsa xatoni yutamiz.
    }
  }
});

bot.on("channel_post", async () => {
  // Kanal registry middleware orqali saqlanadi.
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

bot.catch((error, ctx) => {
  console.error("Bot update error:", {
    updateId: ctx.update?.update_id,
    error,
  });
});

bot
  .launch()
  .then(() => {
    console.log("Telegram bot started");
  })
  .catch((error) => {
    if (error?.response?.error_code === 409) {
      console.error(
        "Telegram bot failed to start: 409 Conflict. Shu token bilan boshqa instance ishlab turibdi."
      );
      return;
    }

    console.error("Telegram bot failed to start:", error);
    process.exit(1);
  });
