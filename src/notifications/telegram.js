import fetch from 'node-fetch';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

/**
 * Send message to any chat (use admin chat for logs)
 */
export async function sendTelegramMessage(message, chatId = process.env.TELEGRAM_ADMIN_CHAT_ID) {
  if (!TELEGRAM_TOKEN || !chatId) {
    console.warn('⚠️ Telegram not configured in environment variables');
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const payload = { chat_id: chatId, text: message, parse_mode: 'Markdown' };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!data.ok) console.error('Telegram API error:', data);
  } catch (err) {
    console.error('Telegram send failed:', err.message);
  }
}