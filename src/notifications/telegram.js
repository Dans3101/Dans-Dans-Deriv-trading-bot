// src/notifications/telegram.js
import TelegramBot from 'node-telegram-bot-api';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TELEGRAM_TOKEN) {
  console.warn('⚠️ Telegram not configured in environment variables');
}

let bot = null;
let adminChats = new Set(); // store chats dynamically

export function getBot() {
  if (!bot && TELEGRAM_TOKEN) {
    bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true, filepath: false });
  }
  return bot;
}

// Register a chat ID as admin
export function registerAdmin(chatId) {
  adminChats.add(chatId);
}

// Send message to all registered admins
export function sendTelegramMessage(message, silent = false) {
  if (!bot) return;

  adminChats.forEach((chatId) => {
    try {
      bot.sendMessage(chatId, message, { parse_mode: 'HTML', disable_notification: silent });
    } catch (err) {
      console.error('Telegram send failed:', err.message);
    }
  });
}