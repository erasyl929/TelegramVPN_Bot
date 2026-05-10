const axios = require('axios');
const config = require('./config');

let token = null;
let tokenExpiry = 0;

async function getToken() {
  if (token && Date.now() < tokenExpiry) return token;

  const res = await axios.post(`${config.MARZBAN_URL}/api/admin/token`, 
    new URLSearchParams({
      username: config.MARZBAN_USER,
      password: config.MARZBAN_PASS
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  token = res.data.access_token;
  tokenExpiry = Date.now() + 60 * 60 * 1000; // 1 час
  return token;
}

function api() {
  return axios.create({
    baseURL: `${config.MARZBAN_URL}/api`,
    headers: { Authorization: `Bearer ${token}` }
  });
}

// Создать пользователя в Marzban
async function createUser(username, days) {
  await getToken();
  const expireTs = Math.floor(Date.now() / 1000) + days * 86400;
  const dataLimit = config.TRAFFIC_LIMIT_GB > 0 
    ? config.TRAFFIC_LIMIT_GB * 1024 * 1024 * 1024 
    : 0;

  const res = await api().post('/user', {
    username,
    proxies: { shadowsocks: { method: 'chacha20-ietf-poly1305' } },
    inbounds: { shadowsocks: ['Shadowsocks TCP'] },
    expire: expireTs,
    data_limit: dataLimit,
    data_limit_reset_strategy: 'no_reset',
    status: 'active'
  });

  return res.data;
}

// Получить пользователя
async function getUser(username) {
  await getToken();
  try {
    const res = await api().get(`/user/${username}`);
    return res.data;
  } catch {
    return null;
  }
}

// Продлить подписку
async function extendUser(username, days) {
  await getToken();
  const user = await getUser(username);
  if (!user) throw new Error('Пользователь не найден в Marzban');

  const currentExpire = user.expire || Math.floor(Date.now() / 1000);
  const newExpire = Math.max(currentExpire, Math.floor(Date.now() / 1000)) + days * 86400;

  const res = await api().put(`/user/${username}`, {
    ...user,
    expire: newExpire,
    status: 'active'
  });

  return res.data;
}

// Получить ссылку подписки
function getSubscriptionUrl(username) {
  return `${config.MARZBAN_URL}/sub/${username}`;
}

module.exports = { createUser, getUser, extendUser, getSubscriptionUrl, getUserLinks };

// Получить конфиги пользователя напрямую
async function getUserLinks(username) {
  await getToken();
  try {
    const res = await axios.get(`${config.MARZBAN_URL}/api/user/${username}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.data.links || [];
  } catch {
    return [];
  }
}