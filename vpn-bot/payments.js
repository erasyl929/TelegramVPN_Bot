const axios = require('axios');
const config = require('./config');
const db = require('./db');

// Генерируем уникальный комментарий для платежа
function generateComment(telegramId, plan) {
  return `vpn_${telegramId}_${plan}_${Date.now()}`;
}

// Создать ожидающий платёж
async function createPendingPayment(telegramId, plan) {
  const planData = config.PLANS[plan];
  const comment = generateComment(telegramId, plan);
  await db.createPayment(telegramId, plan, planData.price, comment);
  return { comment, amount: planData.price, wallet: config.TON_WALLET };
}

// Проверить транзакции через TON API v3
async function checkTonTransactions() {
  try {
    const pending = await db.getPendingPayments();
    if (!pending || pending.length === 0) return [];

    const res = await axios.get(
      `https://toncenter.com/api/v3/transactions`,
      {
        params: {
          account: config.TON_WALLET,
          limit: 20,
          sort: 'desc'
        },
        headers: { 'Accept': 'application/json' }
      }
    );

    const txs = res.data.transactions || [];
    const confirmed = [];

    for (const payment of pending) {
      // Проверяем не истёк ли платёж (24 часа)
      const createdTs = new Date(payment.created_at).getTime() / 1000;
      if (Date.now() / 1000 - createdTs > 86400) continue;

      for (const tx of txs) {
        const inMsg = tx.in_msg;
        if (!inMsg) continue;

        let comment = '';
        try {
          if (inMsg.message_content && inMsg.message_content.decoded) {
            comment = inMsg.message_content.decoded.comment || '';
          }
        } catch {}

        const value = parseInt(inMsg.value || 0) / 1e9;

        if (
          comment === payment.comment &&
          value >= payment.amount_ton * 0.98
        ) {
          await db.markPaymentPaid(payment.comment);
          confirmed.push(payment);
          break;
        }
      }
    }

    return confirmed;
  } catch (err) {
    console.error('TON check error:', err.message);
    if (err.response) {
      console.error('Response:', err.response.status, JSON.stringify(err.response.data));
    }
    return [];
  }
}

module.exports = { createPendingPayment, checkTonTransactions };