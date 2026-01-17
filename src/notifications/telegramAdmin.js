// src/notifications/telegramAdmin.js
import { getBot, registerAdmin } from './telegram.js';

export function listenTelegramAdmin(bots) {
  const bot = getBot();
  if (!bot) {
    console.log('⚠️ Telegram admin disabled — missing token.');
    return;
  }

  console.log('✅ Telegram Admin Bot started.');
  console.log('📡 Telegram admin listener active.');

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();
    const text = msg.text?.trim().toLowerCase();
    if (!text) return;

    // Register this chat as admin
    registerAdmin(chatId);

    if (text === '/status') {
      let reply = '📊 BOT STATUS:\n\n';
      bots.forEach((botInstance, userId) => {
        const u = botInstance.user;
        reply += `• ${userId} → ${u.active ? '🟢 Running' : '🔴 Stopped'}\n`;
        reply += `Balance: $${u.currentBalance.toFixed(2)} | Trades: ${u.tradesToday}\n\n`;
      });
      bot.sendMessage(chatId, reply, { parse_mode: 'HTML' });
    }

    if (text.startsWith('/stop')) {
      const userId = text.split(' ')[1];
      const targetBot = bots.get(userId);
      if (!targetBot) return bot.sendMessage(chatId, `❌ Bot "${userId}" not found.`);
      targetBot.user.ws?.close();
      bot.sendMessage(chatId, `🛑 Bot stopped for ${userId}`);
    }

    if (text.startsWith('/start')) {
      const userId = text.split(' ')[1];
      const targetBot = bots.get(userId);
      if (!targetBot) return bot.sendMessage(chatId, `❌ Bot "${userId}" not found.`);
      if (!targetBot.user.active) {
        targetBot.connect();
        bot.sendMessage(chatId, `✅ Bot started for ${userId}`);
      } else {
        bot.sendMessage(chatId, `ℹ️ Bot already running for ${userId}`);
      }
    }

    if (text === '/help') {
      bot.sendMessage(chatId,
        `📌 Admin Commands:\n/status → Show all bots\n/start <userId> → Start bot\n/stop <userId> → Stop bot`
      );
    }
  });
}