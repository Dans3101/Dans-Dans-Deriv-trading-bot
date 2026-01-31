import TelegramBot from 'node-telegram-bot-api';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

let bot = null;

export function listenTelegramAdmin(bots) {
  if (!TELEGRAM_TOKEN) {
    console.log('⚠️ Telegram admin disabled — missing BOT token.');
    return;
  }

  try { bot?.stopPolling(); } catch (e) {}

  bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true, filepath: false });
  console.log('✅ Telegram Admin Bot started.');
  console.log('📡 Telegram admin listener active.');

  /* ================= MENU KEYBOARD ================= */
  const mainMenu = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📊 Status', callback_data: 'STATUS' }],
        [
          { text: '▶️ Start Bot', callback_data: 'START' },
          { text: '⏸ Stop Bot', callback_data: 'STOP' }
        ],
        [
          { text: '📈 Enable Binary', callback_data: 'BIN_ON' },
          { text: '📉 Disable Binary', callback_data: 'BIN_OFF' }
        ],
        [
          { text: '🥇 Enable Gold', callback_data: 'GOLD_ON' },
          { text: '🛑 Disable Gold', callback_data: 'GOLD_OFF' }
        ],
        [
          { text: '💸 Unlock Trading', callback_data: 'PAY' },
          { text: '🧠 Help', callback_data: 'HELP' }
        ],
        [
          { text: '💰 Change Stake +1', callback_data: 'STAKE_UP' },
          { text: '💰 Change Stake -1', callback_data: 'STAKE_DOWN' }
        ],
        [
          { text: '🚨 Emergency STOP ALL', callback_data: 'STOP_ALL' }
        ]
      ]
    }
  };

  /* ================= MESSAGE HANDLER ================= */
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    if (!text) return;

    const lower = text.toLowerCase();

    if (lower === '/menu') {
      return bot.sendMessage(chatId, '📋 <b>BOT CONTROL MENU</b>\nChoose an action:', { parse_mode: 'HTML', ...mainMenu });
    }

    if (lower === '/status') {
      let reply = '📊 <b>BOT STATUS</b>\n\n';
      bots.forEach((botInstance, userId) => {
        const u = botInstance.user;
        reply += `• <b>${userId}</b>\n`;
        reply += `Active: ${u.active ? '🟢' : '🔴'}\n`;
        reply += `Balance: $${u.currentBalance?.toFixed(2) || '0.00'}\n`;
        reply += `Trades today: ${u.tradesToday || 0}\n`;
        reply += `Binary: ${u.enableBinary === false ? '❌' : '✅'}\n`;
        reply += `Gold: ${u.enableGold ? '✅' : '❌'}\n`;
        reply += `Stake: $${u.baseStake || 0}\n`;
        reply += `Fee paid: ${u.performanceFeePaid ? '✅' : '❌'}\n\n`;
      });
      return bot.sendMessage(chatId, reply, { parse_mode: 'HTML' });
    }

    if (lower === '/help') {
      const helpText = `
<b>📘 Admin Commands</b>

• /menu → Interactive control panel  
• /status → View all bots  
• /start user_001 → Start bot  
• /stop user_001 → Stop bot  
• /pay user_001 → Unlock trading  

Buttons recommended 👍
`;
      return bot.sendMessage(chatId, helpText, { parse_mode: 'HTML' });
    }
  });

  /* ================= CALLBACK HANDLER (BUTTONS) ================= */
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const action = query.data;

    switch (action) {
      case 'STATUS':
        bot.emit('message', { chat: { id: chatId }, text: '/status' });
        break;

      case 'START':
        [...bots.values()].forEach(b => b.connect());
        bot.sendMessage(chatId, '▶️ All bots started');
        break;

      case 'STOP':
        [...bots.values()].forEach(b => { b.user.ws?.close(); b.user.active = false; });
        bot.sendMessage(chatId, '⏸ All bots stopped');
        break;

      case 'BIN_ON':
        [...bots.values()].forEach(b => b.user.enableBinary = true);
        bot.sendMessage(chatId, '📈 Binary trading ENABLED');
        break;

      case 'BIN_OFF':
        [...bots.values()].forEach(b => b.user.enableBinary = false);
        bot.sendMessage(chatId, '📉 Binary trading DISABLED');
        break;

      case 'GOLD_ON':
        [...bots.values()].forEach(b => b.user.enableGold = true);
        bot.sendMessage(chatId, '🥇 Gold trading ENABLED');
        break;

      case 'GOLD_OFF':
        [...bots.values()].forEach(b => b.user.enableGold = false);
        bot.sendMessage(chatId, '🛑 Gold trading DISABLED');
        break;

      case 'PAY':
        [...bots.values()].forEach(b => b.user.performanceFeePaid = true);
        bot.sendMessage(chatId, '💸 Trading unlocked for all bots');
        break;

      case 'HELP':
        bot.sendMessage(chatId, 'Use /menu to control the bot easily 🤖');
        break;

      case 'STAKE_UP':
        [...bots.values()].forEach(b => b.user.baseStake = (b.user.baseStake || 5) + 1);
        bot.sendMessage(chatId, '💰 Base stake increased by $1 for all bots');
        break;

      case 'STAKE_DOWN':
        [...bots.values()].forEach(b => b.user.baseStake = Math.max((b.user.baseStake || 5) - 1, 1));
        bot.sendMessage(chatId, '💰 Base stake decreased by $1 for all bots');
        break;

      case 'STOP_ALL':
        [...bots.values()].forEach(b => { b.user.ws?.close(); b.user.active = false; });
        bot.sendMessage(chatId, '🚨 Emergency STOP: All bots stopped');
        break;
    }

    bot.answerCallbackQuery(query.id);
  });
}