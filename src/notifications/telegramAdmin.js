import TelegramBot from 'node-telegram-bot-api';

let bot = null;
let botsRegistry = {}; // Stores all active bots

export function registerBot(userId, botInstance) {
  botsRegistry[userId] = botInstance;
}

export function removeBot(userId) {
  delete botsRegistry[userId];
}

export function startTelegramAdmin() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const adminChat = process.env.TELEGRAM_CHAT_ID;

  if (!token || !adminChat) {
    console.warn('⚠️ Telegram admin not configured');
    return;
  }

  bot = new TelegramBot(token, { polling: true });
  console.log('🤖 Telegram admin bot started...');

  // ======= STATUS =======
  bot.onText(/\/status/, msg => {
    const chatId = msg.chat.id;

    let report = "📊 *BOT STATUS REPORT*\n\n";

    Object.keys(botsRegistry).forEach(id => {
      const b = botsRegistry[id].user;
      report += `👤 ${id}\n`;
      report += `• Active: ${b.active}\n`;
      report += `• In Trade: ${b.inTrade}\n`;
      report += `• Balance: $${b.currentBalance.toFixed(2)}\n`;
      report += `• Trades Today: ${b.tradesToday}\n\n`;
    });

    bot.sendMessage(chatId, report, { parse_mode: "Markdown" });
  });

  // ======= STOP BOT =======
  bot.onText(/\/stop (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = match[1];

    const botInstance = botsRegistry[userId];
    if (!botInstance) {
      bot.sendMessage(chatId, `❌ No bot found for ${userId}`);
      return;
    }

    botInstance.user.ws.close();
    bot.sendMessage(chatId, `🛑 Bot stopped for ${userId}`);
  });

  // ======= START BOT =======
  bot.onText(/\/start (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = match[1];

    const botInstance = botsRegistry[userId];
    if (!botInstance) {
      bot.sendMessage(chatId, `❌ No bot found for ${userId}`);
      return;
    }

    botInstance.connect();
    bot.sendMessage(chatId, `▶️ Bot restarted for ${userId}`);
  });

  // ======= BALANCES =======
  bot.onText(/\/balances/, msg => {
    const chatId = msg.chat.id;

    let report = "💰 *BALANCES*\n\n";

    Object.keys(botsRegistry).forEach(id => {
      const b = botsRegistry[id].user;
      report += `• ${id}: $${b.currentBalance.toFixed(2)}\n`;
    });

    bot.sendMessage(chatId, report, { parse_mode: "Markdown" });
  });

  // ======= TRADES TODAY =======
  bot.onText(/\/trades/, msg => {
    const chatId = msg.chat.id;

    let report = "📈 *TRADES TODAY*\n\n";

    Object.keys(botsRegistry).forEach(id => {
      const b = botsRegistry[id].user;
      report += `• ${id}: ${b.tradesToday} trades\n`;
    });

    bot.sendMessage(chatId, report, { parse_mode: "Markdown" });
  });

  // ======= SET RISK =======
  bot.onText(/\/setrisk (.+) (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const newRisk = parseFloat(match[1]);
    const userId = match[2];

    const botInstance = botsRegistry[userId];
    if (!botInstance) {
      bot.sendMessage(chatId, `❌ No bot found for ${userId}`);
      return;
    }

    botInstance.user.riskPercent = newRisk;

    bot.sendMessage(
      chatId,
      `🎯 Risk updated for ${userId} → ${newRisk * 100}%`
    );
  });

  // ======= CHANGE MARKET =======
  bot.onText(/\/changemarket (.+) (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const newMarket = match[1];
    const userId = match[2];

    const botInstance = botsRegistry[userId];
    if (!botInstance) {
      bot.sendMessage(chatId, `❌ No bot found for ${userId}`);
      return;
    }

    botInstance.user.market = newMarket;

    bot.sendMessage(
      chatId,
      `📊 Market changed for ${userId} → ${newMarket}`
    );
  });

  // ======= RESET DAILY TRADES =======
  bot.onText(/\/resetday (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = match[1];

    const botInstance = botsRegistry[userId];
    if (!botInstance) {
      bot.sendMessage(chatId, `❌ No bot found for ${userId}`);
      return;
    }

    botInstance.user.tradesToday = 0;

    bot.sendMessage(chatId, `🔄 Daily trades reset for ${userId}`);
  });

  // ======= TODAY PROFIT =======
  bot.onText(/\/profit today/, msg => {
    const chatId = msg.chat.id;

    let report = "📈 *TODAY'S PROFIT/LOSS*\n\n";

    Object.keys(botsRegistry).forEach(id => {
      const b = botsRegistry[id].user;
      const profit = b.currentBalance - b.startBalance;

      report += `• ${id}: $${profit.toFixed(2)}\n`;
    });

    bot.sendMessage(chatId, report, { parse_mode: "Markdown" });
  });

  // ======= LOCK BOT =======
  bot.onText(/\/lock (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = match[1];

    const botInstance = botsRegistry[userId];
    if (!botInstance) {
      bot.sendMessage(chatId, `❌ No bot found for ${userId}`);
      return;
    }

    botInstance.user.locked = true;
    bot.sendMessage(chatId, `🔒 Bot locked for ${userId}`);
  });

  // ======= UNLOCK BOT =======
  bot.onText(/\/unlock (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = match[1];

    const botInstance = botsRegistry[userId];
    if (!botInstance) {
      bot.sendMessage(chatId, `❌ No bot found for ${userId}`);
      return;
    }

    botInstance.user.locked = false;
    bot.sendMessage(chatId, `🔓 Bot unlocked for ${userId}`);
  });
}