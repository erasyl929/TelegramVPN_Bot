require('dotenv').config();

module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  ADMIN_IDS: process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim())),
  MARZBAN_URL: process.env.MARZBAN_URL,
  MARZBAN_USER: process.env.MARZBAN_USER,
  MARZBAN_PASS: process.env.MARZBAN_PASS,
  TON_WALLET: process.env.TON_WALLET,

  // Дефолтные тарифы — перезаписываются из MongoDB при старте
  PLANS: {
    '1m':  { label: '1 месяц',    days: 30,  price: parseFloat(process.env.PRICE_1M)  || 1.5 },
    '3m':  { label: '3 месяца',   days: 90,  price: parseFloat(process.env.PRICE_3M)  || 4.0 },
    '6m':  { label: '6 месяцев',  days: 180, price: parseFloat(process.env.PRICE_6M)  || 7.5 },
    '12m': { label: '12 месяцев', days: 365, price: parseFloat(process.env.PRICE_12M) || 14.0 },
  },

  TRAFFIC_LIMIT_GB: parseInt(process.env.TRAFFIC_LIMIT_GB) || 50,
};