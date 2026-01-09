const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export async function sendTelegram(message) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('⚠️ Telegram not configured');
    return;
  }

  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message
        })
      }
    );
  } catch (err) {
    console.error('Telegram error:', err.message);
  }
}
