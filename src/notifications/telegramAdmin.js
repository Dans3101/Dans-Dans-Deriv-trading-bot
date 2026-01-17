import TelegramBot from 'node-telegram-bot-api';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
let bot = null;

export function listenTelegramAdmin(bots) {
  if (!TELEGRAM_TOKEN) {
    console.log('⚠️ Telegram admin disabled — missing bot token.');
    return;
  }

  // Stop any existing polling (Render hot reload safety)
  try {
    bot?.stopPolling();
  } catch (e) {}

  // Only token here — do NOT use chat ID here
  bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true, filepath: false });
  console.log('✅ Telegram Admin Bot started.');
  console.log('📡 Telegram admin listener active.');

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();
    // Only allow your admin
    if (chatId !== process.env.TELEGRAM_ADMIN_CHAT_ID) return;

    const text = msg.text?.trim().toLowerCase();
    if (!text) return;

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
      if (targetBot.user.ws) targetBot.user.ws.close();
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
      bot.sendMessage(
        chatId,
        `📌 Admin Commands:\n/status → Show all bots\n/start <userId> → Start bot\n/stop <userId> → Stop bot`
      );
    }
  });
}

// Helper to send messages to any chat dynamically
export function sendAdminMessage(chatId, message) {
  if (bot) bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
}

// Helper to send messages to your admin chat by default
export function sendToAdmin(message) {
  if (!process.env.TELEGRAM_ADMIN_CHAT_ID) return;
  sendAdminMessage(process.env.TELEGRAM_ADMIN_CHAT_ID, message);
}