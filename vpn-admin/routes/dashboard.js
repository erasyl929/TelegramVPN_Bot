const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const router = express.Router();

const Payment = mongoose.model('Payment');

router.get('/', async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const col = mongoose.connection.collection('users');

    const [totalUsers, totalPaid, revenueResult, todayPaid, monthPaid, recentPayments, recentUsers] = await Promise.all([
      col.countDocuments(),
      Payment.countDocuments({ status: 'paid' }),
      Payment.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, total: { $sum: '$amount_ton' } } }]),
      Payment.countDocuments({ status: 'paid', paid_at: { $gte: startOfDay } }),
      Payment.countDocuments({ status: 'paid', paid_at: { $gte: startOfMonth } }),
      Payment.find({ status: 'paid' }).sort({ paid_at: -1 }).limit(10).lean(),
      col.find({}).sort({ created_at: -1 }).limit(5).toArray()
    ]);

    res.render('dashboard', {
      stats: {
        totalUsers,
        totalPaid,
        totalRevenue: (revenueResult[0]?.total || 0).toFixed(2),
        todayPaid,
        monthPaid,
      },
      recentPayments,
      recentUsers,
      admin: req.admin
    });
  } catch (err) {
    res.render('dashboard', { stats: {}, recentPayments: [], recentUsers: [], error: err.message, admin: req.admin });
  }
});

module.exports = router;