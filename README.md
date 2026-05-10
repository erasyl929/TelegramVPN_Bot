## 🤖 vpn-bot

Telegram бот для продажи VPN подписок.

**Функции:**
- Продажа VPN через TON оплату
- Автоматическая проверка транзакций
- Реферальная система с бонусными днями
- История платежей
- Поддержка пользователей

**Стек:** Node.js, MongoDB, Marzban API, TON

## 🌐 vpn-admin

Веб-панель администратора.

**Функции:**
- Авторизация через JWT
- Дашборд со статистикой
- Управление пользователями
- Редактор сообщений бота
- Редактор тарифов и цен
- Рассылка с фильтрацией
- Кастомные аватарки и имена

**Стек:** Node.js, Express, EJS, Tailwind CSS, MongoDB

## ⚙️ Установка

### Требования
- Node.js 20+
- MongoDB Atlas
- Marzban VPN панель
- TON кошелёк

### Бот
```bash
cd vpn-bot
cp .env.example .env
# Заполни .env
npm install
pm2 start index.js --name vpn-bot
```

### Админка
```bash
cd vpn-admin
cp .env.example .env
# Заполни .env
npm install
pm2 start server.js --name vpn-admin
```

## 🔑 Переменные окружения

### vpn-bot `.env`
| Переменная | Описание |
|---|---|
| BOT_TOKEN | Токен от @BotFather |
| ADMIN_IDS | Telegram ID админов |
| MONGODB_URI | MongoDB Atlas URI |
| MARZBAN_URL | URL Marzban панели |
| MARZBAN_USER | Логин Marzban |
| MARZBAN_PASS | Пароль Marzban |
| TON_WALLET | TON кошелёк для оплат |

### vpn-admin `.env`
| Переменная | Описание |
|---|---|
| PORT | Порт сервера (3000) |
| MONGODB_URI | MongoDB Atlas URI |
| JWT_SECRET | Секретный ключ JWT |
| ADMIN_USERNAME | Логин админки |
| ADMIN_PASSWORD | Пароль админки |
| MARZBAN_URL | URL Marzban панели |

## 📄 Лицензия

MIT