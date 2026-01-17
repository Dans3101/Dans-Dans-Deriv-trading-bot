// src/notifications/telegramAdmin.js
import TelegramBot from 'node-telegram-bot-api';

/* ================= TELEGRAM ADMIN CONFIG ================= */
const TELEGRAM_TOKEN = process.env.TELEGRAM_ADMIN_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
  console.warn('⚠️ Telegram admin bot not configured. Set TELEGRAM_ADMIN_TOKEN & TELEGRAM_ADMIN_CHAT_ID in env');
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

/**
 * Listen for admin commands and control multi-user bots
 * @param {Array} bots - Array of DerivBot instances
 */
export function listenTelegramAdmin(bots) {
  bot.on('message', async (msg) => {
    // Only allow commands from admin chat
    if (msg.chat.id.toString() !== TELEGRAM_CHAT_ID) return;

    const text = msg.text?.trim().toLowerCase();
    if (!text) return;

    // ================= ADMIN COMMANDS =================
    if (text === '/status') {
      // Show status of all bots
      bots.forEach(userBot => {
        const u = userBot.user;
        bot.sendMessage(
          TELEGRAM_CHAT_ID,
          `${u.userId} | Balance: $${u.currentBalance.toFixed(2)} | Trades Today: ${u.tradesToday} | Active: ${u.active}`
        );
      });
    }

    if (text.startsWith('/stop')) {
      const userId = text.split(' ')[1];
      const targetBot = bots.find(b => b.user.userId === userId);
      if (targetBot) {
        if (targetBot.user.active && targetBot.user.ws) {
          targetBot.user.ws.close();
        }
        bot.sendMessage(TELEGRAM_CHAT_ID, `🛑 Bot stopped for ${userId}`);
      } else {
        bot.sendMessage(TELEGRAM_CHAT_ID, `❌ Bot with userId "${userId}" not found`);
      }
    }

    if (text.startsWith('/start')) {
      const userId = text.split(' ')[1];
      const targetBot = bots.find(b => b.user.userId === userId);
      if (targetBot) {
        if (!targetBot.user.active) {
          targetBot.connect();
          bot.sendMessage(TELEGRAM_CHAT_ID, `✅ Bot started for ${userId}`);
        } else {
          bot.sendMessage(TELEGRAM_CHAT_ID, `ℹ️ Bot already running for ${userId}`);
        }
      } else {
        bot.sendMessage(TELEGRAM_CHAT_ID, `❌ Bot with userId "${userId}" not found`);
      }
    }

    if (text === '/help') {
      bot.sendMessage(
        TELEGRAM_CHAT_ID,
        `📌 Admin Commands:\n/status - Show bot status\n/start <userId> - Start bot\n/stop <userId> - Stop bot`
      );
    }
  });
}