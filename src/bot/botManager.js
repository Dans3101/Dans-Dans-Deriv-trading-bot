// /bot/botManager.js
import { DerivBot } from './derivbot.js';

export class BotManager {
  constructor() {
    this.bots = new Map(); // userId -> DerivBot instance
  }

  addUser(user) {
    if (this.bots.has(user.userId)) {
      console.log(`Bot already exists for ${user.userId}`);
      return;
    }

    const bot = new DerivBot(user);
    this.bots.set(user.userId, bot);
    console.log(`Added bot for user: ${user.userId}`);
  }

  startBot(userId) {
    const bot = this.bots.get(userId);
    if (!bot) {
      console.log(`No bot found for ${userId}`);
      return;
    }

    bot.connect();
    console.log(`Started bot for ${userId}`);
  }

  stopBot(userId) {
    const bot = this.bots.get(userId);
    if (!bot) return;

    if (bot.user.ws) {
      bot.user.ws.close();
    }

    this.bots.delete(userId);
    console.log(`Stopped bot for ${userId}`);
  }

  stopAllBots() {
    for (const [userId, bot] of this.bots.entries()) {
      if (bot.user.ws) bot.user.ws.close();
      console.log(`Stopped bot for ${userId}`);
    }
    this.bots.clear();
  }

  getActiveUsers() {
    return Array.from(this.bots.keys());
  }
}