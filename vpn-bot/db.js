const mongoose = require('mongoose');

async function connect() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ MongoDB подключена');
}

// Схемы
const userSchema = new mongoose.Schema({
  telegram_id:      { type: Number, required: true, unique: true },
  username:         { type: String, default: null },
  first_name:       { type: String, default: null },
  marzban_username: { type: String, default: null },
  referral_code:    { type: String, unique: true, sparse: true },
  referred_by:      { type: Number, default: null },
  bonus_days:       { type: Number, default: 0 },
  is_banned:        { type: Boolean, default: false },
  support_mode:     { type: Boolean, default: false },
  notified_3days:   { type: Boolean, default: false },
  created_at:       { type: Date, default: Date.now }
});

const paymentSchema = new mongoose.Schema({
  telegram_id: { type: Number, required: true },
  plan:        { type: String, required: true },
  amount_ton:  { type: Number, required: true },
  comment:     { type: String, required: true, unique: true },
  status:      { type: String, default: 'pending' },
  created_at:  { type: Date, default: Date.now },
  paid_at:     { type: Date, default: null }
});

const settingsSchema = new mongoose.Schema({
  key:   { type: String, required: true, unique: true },
  value: { type: String, required: true },
});

const broadcastSchema = new mongoose.Schema({
  message:    { type: String, required: true },
  filter:     { type: String, default: 'all' },
  status:     { type: String, default: 'pending' },
  created_at: { type: Date, default: Date.now }
});

const User      = mongoose.model('User', userSchema);
const Payment   = mongoose.model('Payment', paymentSchema);
const Settings  = mongoose.model('Settings', settingsSchema);
const Broadcast = mongoose.model('Broadcast', broadcastSchema);

// --- Пользователи ---
async function getUser(telegramId) {
  return User.findOne({ telegram_id: telegramId });
}

async function createUser(telegramId, username, marzbanUsername, firstName) {
  return User.findOneAndUpdate(
    { telegram_id: telegramId },
    { telegram_id: telegramId, username, first_name: firstName || null, marzban_username: marzbanUsername },
    { upsert: true, new: true }
  );
}

async function registerUser(telegramId, username, firstName) {
  return User.findOneAndUpdate(
    { telegram_id: telegramId },
    { $setOnInsert: { telegram_id: telegramId }, $set: { username, first_name: firstName || null } },
    { upsert: true, new: true }
  );
}

async function setReferralCode(telegramId, code) {
  return User.findOneAndUpdate({ telegram_id: telegramId }, { referral_code: code }, { new: true });
}

async function getUserByReferralCode(code) {
  return User.findOne({ referral_code: code });
}

async function addBonusDays(telegramId, days) {
  return User.findOneAndUpdate({ telegram_id: telegramId }, { $inc: { bonus_days: days } }, { new: true });
}

async function setBanned(telegramId, banned) {
  return User.findOneAndUpdate({ telegram_id: telegramId }, { is_banned: banned }, { new: true });
}

async function setSupportMode(telegramId, mode) {
  return User.findOneAndUpdate({ telegram_id: telegramId }, { support_mode: mode }, { new: true });
}

async function getAllUsers() {
  return User.find();
}

async function setNotified3Days(telegramId) {
  return User.findOneAndUpdate({ telegram_id: telegramId }, { notified_3days: true });
}

async function resetNotified3Days(telegramId) {
  return User.findOneAndUpdate({ telegram_id: telegramId }, { notified_3days: false });
}

// --- Платежи ---
async function createPayment(telegramId, plan, amountTon, comment) {
  return Payment.create({ telegram_id: telegramId, plan, amount_ton: amountTon, comment });
}

async function getPaymentByComment(comment) {
  return Payment.findOne({ comment });
}

async function getPendingPayments() {
  return Payment.find({ status: 'pending' });
}

async function markPaymentPaid(comment) {
  return Payment.findOneAndUpdate({ comment }, { status: 'paid', paid_at: new Date() });
}

async function getUserPayments(telegramId) {
  return Payment.find({ telegram_id: telegramId, status: 'paid' }).sort({ paid_at: -1 });
}

// --- Статистика ---
async function getStats() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalUsers, totalPaid, revenueResult, todayPaid, monthPaid] = await Promise.all([
    User.countDocuments(),
    Payment.countDocuments({ status: 'paid' }),
    Payment.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, total: { $sum: '$amount_ton' } } }]),
    Payment.countDocuments({ status: 'paid', paid_at: { $gte: startOfDay } }),
    Payment.countDocuments({ status: 'paid', paid_at: { $gte: startOfMonth } }),
  ]);

  return {
    totalUsers,
    totalPaid,
    totalRevenue: revenueResult[0]?.total || 0,
    todayPaid,
    monthPaid,
  };
}

// --- Настройки / Сообщения ---
const DEFAULT_MESSAGES = {
  msg_start:    '👋 Привет, {name}!\n\nЯ помогу тебе купить VPN.\n\nВыбери действие:',
  msg_buy:      '💳 *Выбери тариф:*',
  msg_help:     '❓ *Помощь*\n\n1. Купи VPN через *💳 Купить VPN*\n2. Оплати в TON\n3. Получи конфиг и подключись\n\nЕсть вопросы? Напиши нам:',
  msg_payment:  '💳 *Оплата {plan}*\n\nСумма: *{amount} TON*\n\nОтправь на кошелёк:\n`{wallet}`\n\n⚠️ *Комментарий:*\n`{comment}`\n\n_Проверяется каждые 2 минуты. Срок: 24 часа._',
  msg_activated:'✅ *VPN активирован!*\n\n📅 Действует до: *{expire}*\n\n🔗 *Конфиг:*\n`{config}`\n\n_Импортируй в Happ или V2rayNG_',
  msg_novpn:    '❌ У тебя ещё нет активной подписки.\n\nНажми *💳 Купить VPN*',
};

const DEFAULT_PLANS = {
  '1m':  { label: '1 месяц',    days: 30,  price: 1.5  },
  '3m':  { label: '3 месяца',   days: 90,  price: 4.0  },
  '6m':  { label: '6 месяцев',  days: 180, price: 7.5  },
  '12m': { label: '12 месяцев', days: 365, price: 14.0 },
};

async function getMessage(key) {
  const doc = await Settings.findOne({ key });
  return doc ? doc.value : (DEFAULT_MESSAGES[key] || '');
}

async function getPlans() {
  const plans = JSON.parse(JSON.stringify(DEFAULT_PLANS));
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

// --- Рассылки ---
async function getPendingBroadcasts() {
  return Broadcast.find({ status: 'pending' });
}

async function markBroadcastDone(id) {
  return Broadcast.findByIdAndUpdate(id, { status: 'done' });
}

module.exports = {
  connect,
  getUser, createUser, registerUser, getAllUsers,
  setReferralCode, getUserByReferralCode, addBonusDays,
  setBanned, setSupportMode,
  setNotified3Days, resetNotified3Days,
  createPayment, getPaymentByComment, getPendingPayments, markPaymentPaid, getUserPayments,
  getStats,
  getMessage, getPlans, getTrafficLimit,
  getPendingBroadcasts, markBroadcastDone,
};