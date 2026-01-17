// src/notifications/telegramAdmin.js
import TelegramBot from 'node-telegram-bot-api';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

let bot = null;
let isListening = false;

export function startTelegramBot() {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn(
      '⚠️ Telegram bot not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.'
    );
    return null;
  }

  if (bot) {
    console.log('ℹ️ Telegram bot already running — skipping.');
    return bot;
  }

  try {
    bot = new TelegramBot(TELEGRAM_TOKEN, {
      polling: {
        interval: 3000,      // slower polling = fewer errors
        autoStart: true,
        dropPendingUpdates: true // prevents conflicts
      }
    });

    console.log('✅ Telegram Admin Bot started.');
    return bot;
  } catch (err) {
    console.error('❌ Failed to start Telegram bot:', err.message);
    bot = null;
    return null;
  }
}

/**
 * Listen for admin commands
 * @param {Map} bots - Map of userId → DerivBot instance
 */
export function listenTelegramAdmin(bots) {
  const bot = startTelegramBot();
  if (!bot) return;

  if (isListening) {
    console.log('ℹ️ Telegram listener already active.');
    return;
  }

  isListening = true;
  console.log('📡 Telegram admin listener active.');

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();

    if (chatId !== TELEGRAM_CHAT_ID) return;

    const text = msg.text?.trim().toLowerCase();
    if (!text) return;

    if (text === '/status') {
      let reply = '📊 BOT STATUS:\n\n';

      if (bots.size === 0) {
        reply = '⚠️ No bots running.';
      } else {
        bots.forEach((botInstance, userId) => {
          const u = botInstance.user;
          reply += `• ${userId}\n`;
          reply += `Status: ${u.active ? '🟢 Running' : '🔴 Stopped'}\n`;
          reply += `Balance: $${u.currentBalance?.toFixed(2) ?? '0.00'}\n`;
          reply += `Trades Today: ${u.tradesToday ?? 0}\n\n`;
        });
      }

      return bot.sendMessage(chatId, reply);
    }

    if (text.startsWith('/stop')) {
      const userId = text.split(' ')[1];

      if (!userId) {
        return bot.sendMessage(chatId, '❌ Usage: /stop <userId>');
      }

      const targetBot = bots.get(userId);

      if (!targetBot) {
        return bot.sendMessage(chatId, `❌ Bot "${userId}" not found.`);
      }

      if (targetBot.user.ws) {
        targetBot.user.ws.close();
        targetBot.user.active = false;
      }

      return bot.sendMessage(chatId, `🛑 Bot stopped for ${userId}`);
    }

    if (text.startsWith('/start')) {
      const userId = text.split(' ')[1];

      if (!userId) {
        return bot.sendMessage(chatId, '❌ Usage: /start <userId>');
      }

      const targetBot = bots.get(userId);

      if (!targetBot) {
        return bot.sendMessage(chatId, `❌ Bot "${userId}" not found.`);
      }

      if (!targetBot.user.active) {
        await targetBot.connect();
        targetBot.user.active = true;
        return bot.sendMessage(chatId, `✅ Bot started for ${userId}`);
      } else {
        return bot.sendMessage(chatId, `ℹ️ Bot already running for ${userId}`);
      }
    }

    if (text === '/help') {
      return bot.sendMessage(
        chatId,
        `📌 Admin Commands:\n` +
        `/status → Show bots\n` +
        `/start <userId>\n` +
        `/stop <userId>`
      );
    }
  });
}