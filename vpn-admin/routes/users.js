const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const User = mongoose.model('User');
const Payment = mongoose.model('Payment');

// Нативная коллекция для чтения всех полей
function getUserCollection() {
  return mongoose.connection.collection('users');
}

// Multer — загрузка аватарок
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/avatars');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `avatar_${req.params.id}_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Только изображения'));
  }
});

// Marzban API
let marzbanToken = null;
let tokenExpiry = 0;

async function getMarzbanToken() {
  if (marzbanToken && Date.now() < tokenExpiry) return marzbanToken;
  const res = await axios.post(`${process.env.MARZBAN_URL}/api/admin/token`,
    new URLSearchParams({ username: process.env.MARZBAN_USER, password: process.env.MARZBAN_PASS }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  marzbanToken = res.data.access_token;
  tokenExpiry = Date.now() + 60 * 60 * 1000;
  return marzbanToken;
}

async function marzbanApi() {
  const token = await getMarzbanToken();
  return axios.create({
    baseURL: `${process.env.MARZBAN_URL}/api`,
    headers: { Authorization: `Bearer ${token}` }
  });
}

// Список пользователей
router.get('/users', async (req, res) => {
  try {
    const { search, filter, page = 1 } = req.query;
    const limit = 20;
    const skip = (page - 1) * limit;

    let query = {};
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { first_name: { $regex: search, $options: 'i' } },
        { custom_name: { $regex: search, $options: 'i' } },
      ];
      const numId = parseInt(search);
      if (!isNaN(numId)) query.$or.push({ telegram_id: numId });
    }
    if (filter === 'banned') query.is_banned = true;
    if (filter === 'vpn') query.marzban_username = { $ne: null };
    if (filter === 'novpn') query.marzban_username = null;

    const col = getUserCollection();
    const [users, total] = await Promise.all([
      col.find(query).sort({ created_at: -1 }).skip(skip).limit(limit).toArray(),
      col.countDocuments(query)
    ]);

    res.render('users', {
      users, total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      search: search || '',
      filter: filter || '',
      admin: req.admin
    });
  } catch (err) {
    res.render('users', { users: [], total: 0, page: 1, pages: 1, search: '', filter: '', error: err.message, admin: req.admin });
  }
});

// Страница пользователя
router.get('/users/:id', async (req, res) => {
  try {
    const user = await getUserCollection().findOne({ telegram_id: parseInt(req.params.id) });
    if (!user) return res.redirect('/users');

    const payments = await Payment.find({ telegram_id: user.telegram_id, status: 'paid' }).sort({ paid_at: -1 }).lean();

    let marzbanUser = null;
    if (user.marzban_username) {
      try {
        const api = await marzbanApi();
        const r = await api.get(`/user/${user.marzban_username}`);
        marzbanUser = r.data;
      } catch {}
    }

    res.render('user', {
      user, payments, marzbanUser,
      admin: req.admin,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch {
    res.redirect('/users');
  }
});

// Редактировать данные пользователя
router.post('/users/:id/edit', upload.single('avatar'), async (req, res) => {
  try {
    const { custom_name, admin_note } = req.body;
    const update = { $set: { custom_name: custom_name || null, admin_note: admin_note || null } };

    if (req.file) {
      update.$set.custom_avatar = `/uploads/avatars/${req.file.filename}`;
    }

    await User.findOneAndUpdate({ telegram_id: parseInt(req.params.id) }, update, { new: true });
    res.redirect(`/users/${req.params.id}?success=Данные обновлены`);
  } catch (err) {
    res.redirect(`/users/${req.params.id}?error=${err.message}`);
  }
});

// Удалить аватарку
router.post('/users/:id/delete-avatar', async (req, res) => {
  try {
    const user = await User.findOne({ telegram_id: parseInt(req.params.id) }).lean();
    if (user?.custom_avatar) {
      const filePath = path.join(__dirname, '..', user.custom_avatar);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await User.findOneAndUpdate({ telegram_id: parseInt(req.params.id) }, { custom_avatar: null });
    }
    res.redirect(`/users/${req.params.id}?success=Аватарка удалена`);
  } catch (err) {
    res.redirect(`/users/${req.params.id}?error=${err.message}`);
  }
});

// Забанить / разбанить
router.post('/users/:id/ban', async (req, res) => {
  const user = await User.findOne({ telegram_id: parseInt(req.params.id) });
  if (!user) return res.redirect('/users');
  await User.findOneAndUpdate({ telegram_id: user.telegram_id }, { is_banned: !user.is_banned });
  res.redirect(`/users/${req.params.id}?success=Статус обновлён`);
});

// Удалить подписку
router.post('/users/:id/delete-vpn', async (req, res) => {
  try {
    const user = await User.findOne({ telegram_id: parseInt(req.params.id) }).lean();
    if (user?.marzban_username) {
      const api = await marzbanApi();
      await api.delete(`/user/${user.marzban_username}`).catch(() => {});
      await User.findOneAndUpdate({ telegram_id: user.telegram_id }, { marzban_username: null });
    }
    res.redirect(`/users/${req.params.id}?success=Подписка удалена`);
  } catch (err) {
    res.redirect(`/users/${req.params.id}?error=${err.message}`);
  }
});

// Продлить подписку
router.post('/users/:id/extend', async (req, res) => {
  try {
    const { days } = req.body;
    const user = await User.findOne({ telegram_id: parseInt(req.params.id) }).lean();
    if (!user?.marzban_username) return res.redirect(`/users/${req.params.id}?error=Нет подписки`);

    const api = await marzbanApi();
    const r = await api.get(`/user/${user.marzban_username}`);
    const currentExpire = r.data.expire || Math.floor(Date.now() / 1000);
    const newExpire = Math.max(currentExpire, Math.floor(Date.now() / 1000)) + parseInt(days) * 86400;

    await api.put(`/user/${user.marzban_username}`, { ...r.data, expire: newExpire, status: 'active' });
    res.redirect(`/users/${req.params.id}?success=Продлено на ${days} дней`);
  } catch (err) {
    res.redirect(`/users/${req.params.id}?error=${err.message}`);
  }
});

module.exports = router;