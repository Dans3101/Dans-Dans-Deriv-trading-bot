// src/notifications/telegramAdmin.js
import TelegramBot from 'node-telegram-bot-api';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

let bot = null;

export function listenTelegramAdmin(bots) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('⚠️ Telegram admin disabled — missing env variables.');
    return;
  }

  // ======== KILL ANY EXISTING POLLING FIRST (CRITICAL FIX) ========
  try {
    bot?.stopPolling();
  } catch (e) {}

  bot = new TelegramBot(TELEGRAM_TOKEN, {
    polling: true,
    filepath: false
  });

  console.log('✅ Telegram Admin Bot started.');
  console.log('📡 Telegram admin listener active.');

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();

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

      bot.sendMessage(chatId, reply, { parse_mode: 'HTML' });
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
        `📌 Admin Commands:\n/status → Show all bots\n/start <userId> → Start bot\n/stop <userId> → Stop bot`
      );
    }
  });
}