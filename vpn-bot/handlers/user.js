const config = require('../config');
const db = require('../db');
const marzban = require('../marzban');
const { createPendingPayment } = require('../payments');

function register(bot) {

  // /start
  bot.onText(/\/start/, async (msg) => {
  const id = msg.from.id;
  const name = msg.from.first_name || 'друг';
  const username = msg.from.username || null;

  // Сохраняем пользователя в MongoDB
  await db.registerUser(id, username, name);

    const keyboard = {
      reply_markup: {
        keyboard: [
          ['🔑 Мой VPN', '💳 Купить VPN'],
          ['📊 Тарифы', '❓ Помощь']
        ],
        resize_keyboard: true
      }
    };

    await bot.sendMessage(id,
      `👋 Привет, ${name}!\n\nЯ помогу тебе купить VPN.\n\nВыбери действие:`,
      keyboard
    );
  });

  // Тарифы
  bot.onText(/📊 Тарифы|\/plans/, async (msg) => {
    const id = msg.from.id;
    let text = '📦 *Доступные тарифы:*\n\n';
    for (const [key, plan] of Object.entries(config.PLANS)) {
      text += `• *${plan.label}* — ${plan.price} TON\n`;
    }
    text += `\nТрафик: ${config.TRAFFIC_LIMIT_GB > 0 ? config.TRAFFIC_LIMIT_GB + ' ГБ' : 'Безлимит'}\n`;
    text += `\nНажми *💳 Купить VPN* чтобы оформить подписку.`;
    await bot.sendMessage(id, text, { parse_mode: 'Markdown' });
  });

  // Купить VPN
  bot.onText(/💳 Купить VPN|\/buy/, async (msg) => {
    const id = msg.from.id;

    const buttons = Object.entries(config.PLANS).map(([key, plan]) => ([{
      text: `${plan.label} — ${plan.price} TON`,
      callback_data: `buy_${key}`
    }]));

    await bot.sendMessage(id, '💳 *Выбери тариф:*', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    });
  });

  // Мой VPN
  bot.onText(/🔑 Мой VPN|\/myvpn/, async (msg) => {
    const id = msg.from.id;
    const user = db.getUser(id);

    if (!user || !user.marzban_username) {
      return bot.sendMessage(id, '❌ У тебя ещё нет активной подписки.\n\nНажми *💳 Купить VPN*', {
        parse_mode: 'Markdown'
      });
    }

    const mUser = await marzban.getUser(user.marzban_username);
    if (!mUser) {
      return bot.sendMessage(id, '⚠️ Не удалось получить данные. Напиши в поддержку.');
    }

    const expireDate = mUser.expire
      ? new Date(mUser.expire * 1000).toLocaleDateString('ru-RU')
      : 'Не ограничено';

    const usedGB = ((mUser.used_traffic || 0) / 1e9).toFixed(2);
    const limitGB = mUser.data_limit > 0
      ? (mUser.data_limit / 1e9).toFixed(0) + ' ГБ'
      : 'Безлимит';

    const subUrl = marzban.getSubscriptionUrl(user.marzban_username);

    const text = `🔑 *Твой VPN*\n\n` +
      `📅 Действует до: *${expireDate}*\n` +
      `📊 Использовано: *${usedGB} ГБ* из ${limitGB}\n` +
      `🔴 Статус: *${mUser.status === 'active' ? '✅ Активен' : '❌ ' + mUser.status}*\n\n` +
      `🔗 Ссылка подписки:\n\`${subUrl}\`\n\n` +
      `_Добавь эту ссылку в Happ/V2rayNG_`;

    await bot.sendMessage(id, text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '🔄 Продлить', callback_data: 'extend' }
        ]]
      }
    });
  });

  // Помощь
  bot.onText(/❓ Помощь|\/help/, async (msg) => {
    await bot.sendMessage(msg.from.id,
      `❓ *Помощь*\n\n` +
      `1. Купи VPN через *💳 Купить VPN*\n` +
      `2. Оплати в TON по инструкции\n` +
      `3. После оплаты получишь ссылку подписки\n` +
      `4. Добавь ссылку в приложение (Happ, V2rayNG, Streisand)\n\n` +
      `По вопросам: @your_support_username`,
      { parse_mode: 'Markdown' }
    );
  });

  // Callback: выбор тарифа
  bot.on('callback_query', async (query) => {
    const id = query.from.id;
    const data = query.data;

    if (data.startsWith('buy_')) {
      const planKey = data.replace('buy_', '');
      const plan = config.PLANS[planKey];
      if (!plan) return;

      const payment = await createPendingPayment(id, planKey);

      const text =
        `💳 *Оплата ${plan.label}*\n\n` +
        `Сумма: *${plan.price} TON*\n\n` +
        `Отправь точно *${plan.price} TON* на кошелёк:\n` +
        `\`${payment.wallet}\`\n\n` +
        `⚠️ *Обязательно укажи комментарий:*\n` +
        `\`${payment.comment}\`\n\n` +
        `_Платёж проверяется автоматически каждые 2 минуты._\n` +
        `_Срок оплаты: 24 часа._`;

      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(id, text, { parse_mode: 'Markdown' });
    }

    if (data === 'extend') {
      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(id, '💳 Выбери новый тариф для продления:', {
        reply_markup: {
          inline_keyboard: Object.entries(config.PLANS).map(([key, plan]) => ([{
            text: `${plan.label} — ${plan.price} TON`,
            callback_data: `buy_${key}`
          }]))
        }
      });
    }
  });
}

module.exports = { register };