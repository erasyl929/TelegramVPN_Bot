const config = require('../config');
const db = require('../db');
const marzban = require('../marzban');
const { createPendingPayment } = require('../payments');

function generateRefCode(telegramId) {
  return `ref_${telegramId}_${Math.random().toString(36).substr(2, 5)}`;
}

function fillTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] || '');
}

function register(bot) {

  bot.onText(/\/start(.*)/, async (msg, match) => {
    const id = msg.from.id;
    const username = msg.from.username || null;
    const firstName = msg.from.first_name || 'друг';
    const refArg = match[1].trim();

    await db.registerUser(id, username, firstName);

    let user = await db.getUser(id);

    if (refArg && refArg.startsWith('ref_') && !user.referred_by) {
      const referrer = await db.getUserByReferralCode(refArg);
      if (referrer && referrer.telegram_id !== id) {
        await db.addBonusDays(referrer.telegram_id, 7);
        await db.addBonusDays(id, 3);
        await bot.sendMessage(referrer.telegram_id,
          '🎁 По твоей реферальной ссылке зарегистрировался новый пользователь!\n+7 дней бонуса начислено.'
        ).catch(() => {});
      }
    }

    if (!user.referral_code) {
      await db.setReferralCode(id, generateRefCode(id));
    }

    const msgTemplate = await db.getMessage('msg_start');
    const text = fillTemplate(msgTemplate, { name: firstName });

    const keyboard = {
      reply_markup: {
        keyboard: [
          ['🔑 Мой VPN', '💳 Купить VPN'],
          ['📊 Тарифы', '💰 История платежей'],
          ['🎁 Реферальная программа', '❓ Помощь']
        ],
        resize_keyboard: true
      }
    };

    await bot.sendMessage(id, text, keyboard);
  });

  bot.onText(/📊 Тарифы|\/plans/, async (msg) => {
    const id = msg.from.id;
    const plans = await db.getPlans();
    let text = '📦 *Доступные тарифы:*\n\n';
    for (const plan of Object.values(plans)) {
      text += `• *${plan.label}* — ${plan.price} TON\n`;
    }
    const limit = await db.getTrafficLimit();
    text += `\nТрафик: ${limit > 0 ? limit + ' ГБ' : 'Безлимит'}\n`;
    text += `\nНажми *💳 Купить VPN* чтобы оформить подписку.`;
    await bot.sendMessage(id, text, { parse_mode: 'Markdown' });
  });

  bot.onText(/💳 Купить VPN|\/buy/, async (msg) => {
    const id = msg.from.id;
    const user = await db.getUser(id);
    const plans = await db.getPlans();

    const buttons = Object.entries(plans).map(([key, plan]) => ([{
      text: `${plan.label} — ${plan.price} TON`,
      callback_data: `buy_${key}`
    }]));

    const msgTemplate = await db.getMessage('msg_buy');
    let text = msgTemplate;
    if (user && user.bonus_days > 0) {
      text += `\n\n🎁 У тебя есть *${user.bonus_days} бонусных дней*!`;
    }

    await bot.sendMessage(id, text, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    });
  });

  bot.onText(/🔑 Мой VPN|\/myvpn/, async (msg) => {
    const id = msg.from.id;
    const user = await db.getUser(id);

    if (!user || !user.marzban_username) {
      const text = await db.getMessage('msg_novpn');
      return bot.sendMessage(id, text, { parse_mode: 'Markdown' });
    }

    const mUser = await marzban.getUser(user.marzban_username);
    if (!mUser) {
      return bot.sendMessage(id, '⚠️ Не удалось получить данные. Напиши в поддержку.');
    }

    const expireDate = mUser.expire
      ? new Date(mUser.expire * 1000).toLocaleDateString('ru-RU')
      : 'Не ограничено';

    const usedGB = ((mUser.used_traffic || 0) / 1e9).toFixed(2);
    const limitGB = mUser.data_limit > 0 ? (mUser.data_limit / 1e9).toFixed(0) + ' ГБ' : 'Безлимит';
    const links = await marzban.getUserLinks(user.marzban_username);
    const configText = links.length > 0 ? links[0] : 'Нет конфига';

    const text = `🔑 *Твой VPN*\n\n` +
      `📅 Действует до: *${expireDate}*\n` +
      `📊 Использовано: *${usedGB} ГБ* из ${limitGB}\n` +
      `✅ Статус: *${mUser.status === 'active' ? 'Активен' : mUser.status}*\n\n` +
      `🔗 *Конфиг:*\n\`${configText}\`\n\n` +
      `_Импортируй конфиг в Happ или V2rayNG_`;

    await bot.sendMessage(id, text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Продлить', callback_data: 'extend' }],
          [{ text: '📱 Инструкция', callback_data: 'instruction' }]
        ]
      }
    });
  });

  bot.onText(/💰 История платежей|\/history/, async (msg) => {
    const id = msg.from.id;
    const payments = await db.getUserPayments(id);
    const plans = await db.getPlans();

    if (!payments || payments.length === 0) {
      return bot.sendMessage(id, '📭 У тебя пока нет оплаченных подписок.');
    }

    let text = `💰 *История платежей:*\n\n`;
    for (const p of payments.slice(0, 10)) {
      const date = new Date(p.paid_at).toLocaleDateString('ru-RU');
      const plan = plans[p.plan];
      text += `• ${date} — ${plan ? plan.label : p.plan} — ${p.amount_ton} TON\n`;
    }

    await bot.sendMessage(id, text, { parse_mode: 'Markdown' });
  });

  bot.onText(/🎁 Реферальная программа|\/ref/, async (msg) => {
    const id = msg.from.id;
    let user = await db.getUser(id);

    if (!user.referral_code) {
      await db.setReferralCode(id, generateRefCode(id));
      user = await db.getUser(id);
    }

    const botInfo = await bot.getMe();
    const refLink = `https://t.me/${botInfo.username}?start=${user.referral_code}`;

    await bot.sendMessage(id,
      `🎁 *Реферальная программа*\n\n` +
      `За каждого друга: *+7 дней* тебе, *+3 дня* другу\n\n` +
      `🔗 Твоя ссылка:\n\`${refLink}\`\n\n` +
      `💎 Бонусных дней: *${user.bonus_days || 0}*`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.onText(/❓ Помощь|\/help/, async (msg) => {
    const text = await db.getMessage('msg_help');
    await bot.sendMessage(msg.from.id, text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '💬 Написать в поддержку', callback_data: 'support' }]]
      }
    });
  });

  bot.on('callback_query', async (query) => {
    const id = query.from.id;
    const data = query.data;

    if (data.startsWith('buy_')) {
      const planKey = data.replace('buy_', '');
      const plans = await db.getPlans();
      const plan = plans[planKey];
      if (!plan) return;

      const payment = await createPendingPayment(id, planKey);
      const msgTemplate = await db.getMessage('msg_payment');
      const text = fillTemplate(msgTemplate, {
        plan: plan.label,
        amount: plan.price,
        wallet: payment.wallet,
        comment: payment.comment
      });

      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(id, text, { parse_mode: 'Markdown' });
    }

    if (data === 'extend') {
      const plans = await db.getPlans();
      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(id, '💳 Выбери тариф для продления:', {
        reply_markup: {
          inline_keyboard: Object.entries(plans).map(([key, plan]) => ([{
            text: `${plan.label} — ${plan.price} TON`,
            callback_data: `buy_${key}`
          }]))
        }
      });
    }

    if (data === 'instruction') {
      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(id,
        `📱 *Инструкция по подключению*\n\n` +
        `*Android:* Happ или V2rayNG → + → Import from clipboard\n\n` +
        `*iOS:* Streisand или Shadowrocket → + → Import\n\n` +
        `*Windows:* Hiddify → Add profile\n\n` +
        `*Mac:* FoXray или Hiddify → Import`,
        { parse_mode: 'Markdown' }
      );
    }

    if (data === 'support') {
      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(id, '💬 Напиши свой вопрос:');
      await db.setSupportMode(id, true);
    }
  });

  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;
    const id = msg.from.id;
    const user = await db.getUser(id);
    if (!user || !user.support_mode) return;

    for (const adminId of config.ADMIN_IDS) {
      await bot.sendMessage(adminId,
        `💬 *Вопрос от пользователя*\nID: \`${id}\`\n${msg.text}\n\nОтветить: /reply ${id} <текст>`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    }

    await bot.sendMessage(id, '✅ Сообщение отправлено! Ответим в ближайшее время.');
    await db.setSupportMode(id, false);
  });
}

module.exports = { register };