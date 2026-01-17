// src/notifications/telegramAdmin.js
import TelegramBot from 'node-telegram-bot-api';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

let bot = null;
let isListening = false; // <-- prevents duplicate polling

if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
  console.warn(
    '⚠️ Telegram admin bot NOT configured.\n' +
    'Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Render.'
  );
} else {
  try {
    bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
    console.log('✅ Telegram Admin Bot connected.');
  } catch (err) {
    console.error('❌ Failed to start Telegram bot:', err.message);
  }
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

  // 🚫 Prevent multiple listeners (your previous bug)
  if (isListening) {
    console.log('ℹ️ Telegram admin already listening — skipping.');
    return;
  }

  isListening = true;
  console.log('📡 Telegram admin listener active.');

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();

    // Only allow the configured admin chat
    if (chatId !== TELEGRAM_CHAT_ID) return;

    const text = msg.text?.trim().toLowerCase();
    if (!text) return;

    /* ============ COMMANDS ============ */

    if (text === '/status') {
      let reply = '📊 *BOT STATUS*\n\n';

      if (bots.size === 0) {
        reply = '⚠️ No bots currently running.';
      } else {
        bots.forEach((botInstance, userId) => {
          const u = botInstance.user;
          reply += `• *${userId}*\n`;
          reply += `Status: ${u.active ? '🟢 Running' : '🔴 Stopped'}\n`;
          reply += `Balance: $${u.currentBalance?.toFixed(2) ?? '0.00'}\n`;
          reply += `Trades Today: ${u.tradesToday ?? 0}\n\n`;
        });
      }

      return bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
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

      return bot.sendMessage(chatId, `🛑 Bot stopped for *${userId}*`, {
        parse_mode: 'Markdown'
      });
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

        return bot.sendMessage(
          chatId,
          `✅ Bot started for *${userId}*`,
          { parse_mode: 'Markdown' }
        );
      } else {
        return bot.sendMessage(
          chatId,
          `ℹ️ Bot already running for *${userId}*`,
          { parse_mode: 'Markdown' }
        );
      }
    }

    if (text === '/help') {
      return bot.sendMessage(
        chatId,
        `📌 *Admin Commands*\n\n` +
          `/status → Show all bots\n` +
          `/start <userId> → Start bot\n` +
          `/stop <userId> → Stop bot`,
        { parse_mode: 'Markdown' }
      );
    }
  });
}