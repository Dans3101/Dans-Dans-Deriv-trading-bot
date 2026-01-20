// src/notifications/telegramAdmin.js
import TelegramBot from 'node-telegram-bot-api';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

let bot = null;

export function listenTelegramAdmin(bots) {
  if (!TELEGRAM_TOKEN) {
    console.log('⚠️ Telegram admin disabled — missing BOT token.');
    return;
  }

  // Stop any previous polling to avoid 409 errors
  try {
    bot?.stopPolling();
  } catch (e) {}

  // Create a new bot instance
  bot = new TelegramBot(TELEGRAM_TOKEN, {
    polling: true,
    filepath: false
  });

  console.log('✅ Telegram Admin Bot started.');
  console.log('📡 Telegram admin listener active.');

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    if (!text) return;

    const lower = text.toLowerCase();

    // ====== /status ======
    if (lower === '/status') {
      let reply = '📊 <b>BOT STATUS</b>\n\n';

      bots.forEach((botInstance, userId) => {
        const u = botInstance.user;
        reply += `• <b>${userId}</b>\n`;
        reply += `Running: ${u.active ? '🟢' : '🔴'}\n`;
        reply += `Balance: $${u.currentBalance.toFixed(2)}\n`;
        reply += `Trades today: ${u.tradesToday}\n`;
        reply += `Fee paid: ${u.performanceFeePaid ? '✅' : '❌'}\n\n`;
      });

      return bot.sendMessage(chatId, reply, { parse_mode: 'HTML' });
    }

    // ====== /stop userId ======
    if (lower.startsWith('/stop')) {
      const userId = text.split(' ')[1];
      if (!userId) return bot.sendMessage(chatId, '❌ Usage: /stop user_001');

      const targetBot = bots.get(userId);
      if (!targetBot) return bot.sendMessage(chatId, `❌ Bot "${userId}" not found.`);

      if (targetBot.user.ws) targetBot.user.ws.close();
      targetBot.user.active = false;

      return bot.sendMessage(chatId, `🛑 Bot stopped for ${userId}`);
    }

    // ====== /start userId ======
    if (lower.startsWith('/start')) {
      const userId = text.split(' ')[1];
      if (!userId) return bot.sendMessage(chatId, '❌ Usage: /start user_001');

      const targetBot = bots.get(userId);
      if (!targetBot) return bot.sendMessage(chatId, `❌ Bot "${userId}" not found.`);

      if (!targetBot.user.active) {
        targetBot.connect();
        return bot.sendMessage(chatId, `✅ Bot started for ${userId}`);
      } else {
        return bot.sendMessage(chatId, `ℹ️ Bot already running for ${userId}`);
      }
    }

    // ====== /pay userId ======
    if (lower.startsWith('/pay')) {
      const userId = text.split(' ')[1];
      if (!userId) return bot.sendMessage(chatId, '❌ Usage: /pay user_001');

      const targetBot = bots.get(userId);
      if (!targetBot) return bot.sendMessage(chatId, `❌ Bot "${userId}" not found.`);

      targetBot.user.performanceFeePaid = true;
      return bot.sendMessage(chatId, `💸 Payment confirmed — trading UNLOCKED for <b>${userId}</b>`, { parse_mode: 'HTML' });
    }

    // ====== /help ======
    if (lower === '/help') {
      const helpText = `
📌 <b>Admin Commands</b>

• /status  
→ Show all bots

• /start user_001  
→ Start a bot

• /stop user_001  
→ Stop a bot

• /pay user_001  
→ Mark fee as PAID (unlock real trading)
`;
      return bot.sendMessage(chatId, helpText, { parse_mode: 'HTML' });
    }
  });
}