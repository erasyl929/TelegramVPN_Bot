require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const path = require('path');

const app = express();

// Mongoose схемы
const userSchema = new mongoose.Schema({
  telegram_id:      { type: Number, required: true, unique: true },
  username:         { type: String, default: null },
  first_name:       { type: String, default: null },
  marzban_username: { type: String, default: null },
  referral_code:    { type: String, unique: true, sparse: true },
  referred_by:      { type: Number, default: null },
  bonus_days:       { type: Number, default: 0 },
  is_banned:        { type: Boolean, default: false },
  notified_3days:   { type: Boolean, default: false },
  admin_note:       { type: String, default: null },
  custom_avatar:    { type: String, default: null },
  custom_name:      { type: String, default: null },
  created_at:       { type: Date, default: Date.now }
}, { strict: false });

const paymentSchema = new mongoose.Schema({
  telegram_id: { type: Number, required: true },
  plan:        { type: String, required: true },
  amount_ton:  { type: Number, required: true },
  comment:     { type: String, required: true, unique: true },
  status:      { type: String, default: 'pending' },
  created_at:  { type: Date, default: Date.now },
  paid_at:     { type: Date, default: null }
});

const broadcastSchema = new mongoose.Schema({
  message:    { type: String, required: true },
  filter:     { type: String, default: 'all' },
  status:     { type: String, default: 'pending' },
  created_at: { type: Date, default: Date.now }
});

mongoose.model('User', userSchema);
mongoose.model('Payment', paymentSchema);
mongoose.model('Broadcast', broadcastSchema);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { dotfiles: 'allow' }));

// EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
const authMiddleware = require('./middleware/auth');
app.use('/', require('./routes/auth'));
app.use('/', authMiddleware, require('./routes/dashboard'));
app.use('/', authMiddleware, require('./routes/users'));
app.use('/', authMiddleware, require('./routes/settings').router);

mongoose.connect(process.env.MONGODB_URI).then(() => {
  console.log('✅ MongoDB подключена');
  app.listen(process.env.PORT || 3000, () => {
    console.log(`🌐 Админка запущена на http://localhost:${process.env.PORT || 3000}`);
  });
}).catch(console.error);