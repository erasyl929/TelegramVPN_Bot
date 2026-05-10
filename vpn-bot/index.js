require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const db = require('./db');
const { checkTonTransactions } = require('./payments');
const { activateVPN } = require('./handlers/admin');
const userHandler = require('./handlers/user');
const adminHandler = require('./handlers/admin');

async function loadPlansFromDB() {
  try {
    const plans = await db.getPlans();
    if (plans) Object.assign(config.PLANS, plans);
    const limit = await db.getTrafficLimit();
    if (limit !== null) config.TRAFFIC_LIMIT_GB = limit;
  } catch (err) {
    console.log('⚠️ Дефолтные тарифы:', err.message);
  }
}

async function main() {
  await db.connect();
  await loadPlansFromDB();
  setInterval(loadPlansFromDB, 5 * 60 * 1000);

  const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });

  userHandler.register(bot);
  adminHandler.register(bot);

  async function checkPayments() {
    try {
      const confirmed = await checkTonTransactions();
      for (const payment of confirmed) {
        try {
          await activateVPN(bot, payment.telegram_id, payment.plan);
        } catch (err) {
          await bot.sendMessage(payment.telegram_id,
            '⚠️ Оплата получена, но ошибка активации. Напиши в поддержку!'
          ).catch(() => {});
        }
      }
    } catch (err) {
      console.error('Ошибка платежей:', err.message);
    }
  }

  async function processBroadcasts() {
    try {
      const broadcasts = await db.getPendingBroadcasts();
      for (const broadcast of broadcasts) {
        await db.markBroadcastDone(broadcast._id);
        const allUsers = await db.getAllUsers();
        let targets = allUsers.filter(u => !u.is_banned);

        if (broadcast.filter === 'vpn') targets = targets.filter(u => u.marzban_username);
        else if (broadcast.filter === 'novpn') targets = targets.filter(u => !u.marzban_username);

        let sent = 0, failed = 0;
        for (const user of targets) {
          try {
            await bot.sendMessage(user.telegram_id, broadcast.message, { parse_mode: 'Markdown' });
            sent++;
          } catch { failed++; }
          await new Promise(r => setTimeout(r, 50));
        }
        console.log(`📢 Рассылка: ${sent} доставлено, ${failed} ошибок`);
      }
    } catch (err) {
      console.error('Ошибка рассылки:', err.message);
    }
  }

  setInterval(checkPayments, 2 * 60 * 1000);
  setInterval(processBroadcasts, 60 * 1000);

  checkPayments();
  processBroadcasts();

  console.log('🤖 VPN Bot запущен!');
  bot.on('polling_error', (err) => console.error('Polling error:', err.message));
}

main().catch(console.error);
process.on('unhandledRejection', (err) => console.error('Unhandled:', err.message));