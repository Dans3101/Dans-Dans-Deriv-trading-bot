import fetch from 'node-fetch';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Send message to Telegram safely using HTML parse mode
 */
export async function sendTelegramMessage(message) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('⚠️ Telegram not configured in Render environment variables');
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

  // Escape HTML special chars
  const safeMessage = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const payload = {
    chat_id: TELEGRAM_CHAT_ID,
    text: safeMessage,
    parse_mode: 'HTML'
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!data.ok) {
      console.error('Telegram API error:', data);
    }
  } catch (err) {
    console.error('Telegram send failed:', err.message);
  }
}