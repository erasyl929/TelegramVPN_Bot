const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const User = mongoose.model('User');
const Broadcast = mongoose.model('Broadcast');

// Схема настроек
const settingsSchema = new mongoose.Schema({
  key:   { type: String, required: true, unique: true },
  value: { type: String, required: true },
});
const Settings = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);

// Дефолтные сообщения
const DEFAULT_MESSAGES = {
  msg_start:    '👋 Привет, {name}!\n\nЯ помогу тебе купить VPN.\n\nВыбери действие:',
  msg_buy:      '💳 *Выбери тариф:*',
  msg_help:     '❓ *Помощь*\n\n1. Купи VPN через *💳 Купить VPN*\n2. Оплати в TON\n3. Получи конфиг и подключись\n\nЕсть вопросы? Напиши нам:',
  msg_payment:  '💳 *Оплата {plan}*\n\nСумма: *{amount} TON*\n\nОтправь на кошелёк:\n`{wallet}`\n\n⚠️ *Комментарий:*\n`{comment}`\n\n_Проверяется каждые 2 минуты. Срок: 24 часа._',
  msg_activated:'✅ *VPN активирован!*\n\n📅 Действует до: *{expire}*\n\n🔗 *Конфиг:*\n`{config}`\n\n_Импортируй в Happ или V2rayNG_',
  msg_novpn:    '❌ У тебя ещё нет активной подписки.\n\nНажми *💳 Купить VPN*',
};

const MESSAGE_LABELS = {
  msg_start:    '👋 Приветствие (/start)',
  msg_buy:      '💳 Заголовок покупки',
  msg_help:     '❓ Помощь',
  msg_payment:  '💰 Инструкция оплаты',
  msg_activated:'✅ VPN активирован',
  msg_novpn:    '🔒 Нет подписки',
};

// Дефолтные тарифы
const DEFAULT_PLANS = {
  '1m':  { label: '1 месяц',    days: 30,  price: 1.5 },
  '3m':  { label: '3 месяца',   days: 90,  price: 4.0 },
  '6m':  { label: '6 месяцев',  days: 180, price: 7.5 },
  '12m': { label: '12 месяцев', days: 365, price: 14.0 },
};

async function getSettings() {
  const docs = await Settings.find();
  const result = { ...DEFAULT_MESSAGES };
  for (const doc of docs) {
    result[doc.key] = doc.value;
  }
  return result;
}

async function getPlans() {
  const plans = { ...DEFAULT_PLANS };
  for (const key of Object.keys(DEFAULT_PLANS)) {
    const doc = await Settings.findOne({ key: `plan_${key}` });
    if (doc) {
      try { plans[key] = JSON.parse(doc.value); } catch {}
    }
  }
  return plans;
}

async function getTrafficLimit() {
  const doc = await Settings.findOne({ key: 'traffic_limit_gb' });
  return doc ? parseInt(doc.value) : 50;
}

// Страница настроек
router.get('/settings', async (req, res) => {
  try {
    const [messages, plans, trafficLimit] = await Promise.all([
      getSettings(),
      getPlans(),
      getTrafficLimit()
    ]);
    res.render('settings', {
      admin: req.admin,
      messages,
      labels: MESSAGE_LABELS,
      plans,
      trafficLimit,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (err) {
    res.render('settings', {
      admin: req.admin,
      messages: DEFAULT_MESSAGES,
      labels: MESSAGE_LABELS,
      plans: DEFAULT_PLANS,
      trafficLimit: 50,
      success: null,
      error: err.message
    });
  }
});

// Сохранить сообщения
router.post('/settings/messages', async (req, res) => {
  try {
    for (const key of Object.keys(DEFAULT_MESSAGES)) {
      if (req.body[key] !== undefined) {
        await Settings.findOneAndUpdate(
          { key },
          { $set: { value: req.body[key] } },
          { upsert: true, new: true }
        );
      }
    }
    res.redirect('/settings?success=Сообщения сохранены#messages');
  } catch (err) {
    res.redirect(`/settings?error=${err.message}`);
  }
});

// Сбросить сообщение
router.post('/settings/messages/reset/:key', async (req, res) => {
  try {
    await Settings.deleteOne({ key: req.params.key });
    res.redirect('/settings?success=Сообщение сброшено#messages');
  } catch (err) {
    res.redirect(`/settings?error=${err.message}`);
  }
});

// Сохранить тарифы
router.post('/settings/plans', async (req, res) => {
  try {
    for (const key of Object.keys(DEFAULT_PLANS)) {
      const label = req.body[`${key}_label`];
      const days  = parseInt(req.body[`${key}_days`]);
      const price = parseFloat(req.body[`${key}_price`]);

      if (label && days && !isNaN(price)) {
        await Settings.findOneAndUpdate(
          { key: `plan_${key}` },
          { $set: { value: JSON.stringify({ label, days, price }) } },
          { upsert: true, new: true }
        );
      }
    }

    // Лимит трафика
    if (req.body.traffic_limit_gb !== undefined) {
      await Settings.findOneAndUpdate(
        { key: 'traffic_limit_gb' },
        { $set: { value: req.body.traffic_limit_gb } },
        { upsert: true, new: true }
      );
    }

    res.redirect('/settings?success=Тарифы сохранены#plans');
  } catch (err) {
    res.redirect(`/settings?error=${err.message}`);
  }
});

// Сбросить тарифы к дефолту
router.post('/settings/plans/reset', async (req, res) => {
  try {
    await Settings.deleteMany({ key: { $regex: /^plan_/ } });
    await Settings.deleteOne({ key: 'traffic_limit_gb' });
    res.redirect('/settings?success=Тарифы сброшены#plans');
  } catch (err) {
    res.redirect(`/settings?error=${err.message}`);
  }
});

// Рассылка
router.post('/settings/broadcast', async (req, res) => {
  try {
    const { message, filter } = req.body;
    if (!message) return res.redirect('/settings?error=Сообщение пустое#broadcast');
    await Broadcast.create({ message, filter });
    res.redirect('/settings?success=Рассылка поставлена в очередь#broadcast');
  } catch (err) {
    res.redirect(`/settings?error=${err.message}`);
  }
});

module.exports = { router, getPlans, getTrafficLimit };