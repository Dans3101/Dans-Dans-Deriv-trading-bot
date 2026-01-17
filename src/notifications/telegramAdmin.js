// src/notifications/telegramAdmin.js
import TelegramBot from 'node-telegram-bot-api';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

let bot = null;

if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
  console.warn(
    '⚠️ Telegram admin bot NOT configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_CHAT_ID in Render.'
  );
} else {
  bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
  console.log('✅ Telegram Admin Bot connected.');
}

/**
 * Listen for admin commands
 * @param {Map} bots - Map of userId → DerivBot instance
 */
export function listenTelegramAdmin(bots) {
  if (!bot) {
    console.log('⚠️ Telegram admin disabled.');
    return;
  }

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();

    // Only allow admin
    if (chatId !== TELEGRAM_CHAT_ID) return;

    const text = msg.text?.trim().toLowerCase();
    if (!text) return;

    if (text === '/status') {
      let reply = '📊 BOT STATUS:\n\n';

      bots.forEach((botInstance, userId) => {
        const u = botInstance.user;
        reply += `• ${userId} → ${
          u.active ? '🟢 Running' : '🔴 Stopped'
        }\nBalance: $${u.currentBalance.toFixed(2)} | Trades: ${u.tradesToday}\n\n`;
      });

      bot.sendMessage(chatId, reply);
    }

    if (text.startsWith('/stop')) {
      const userId = text.split(' ')[1];
      const targetBot = bots.get(userId);

      if (!targetBot) {
        return bot.sendMessage(chatId, `❌ Bot "${userId}" not found.`);
      }

      if (targetBot.user.ws) {
        targetBot.user.ws.close();
      }

      bot.sendMessage(chatId, `🛑 Bot stopped for ${userId}`);
    }

    if (text.startsWith('/start')) {
      const userId = text.split(' ')[1];
      const targetBot = bots.get(userId);

      if (!targetBot) {
        return bot.sendMessage(chatId, `❌ Bot "${userId}" not found.`);
      }

      if (!targetBot.user.active) {
        targetBot.connect();
        bot.sendMessage(chatId, `✅ Bot started for ${userId}`);
      } else {
        bot.sendMessage(chatId, `ℹ️ Bot already running for ${userId}`);
      }
    }

    if (text === '/help') {
      bot.sendMessage(
        chatId,
        `📌 Admin Commands:\n
/status → Show all bots
/start <userId> → Start bot
/stop <userId> → Stop bot`
      );
    }
  });
}