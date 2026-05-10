const config = require('../config');
const db = require('../db');
const marzban = require('../marzban');

function isAdmin(id) {
  return config.ADMIN_IDS.includes(id);
}

function register(bot) {

  bot.onText(/\/admin/, async (msg) => {
    if (!isAdmin(msg.from.id)) return;

    await bot.sendMessage(msg.from.id,
      `⚙️ *Панель администратора*`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📊 Статистика', callback_data: 'admin_stats' }],
            [{ text: '👥 Все пользователи', callback_data: 'admin_users' }],
            [{ text: '➕ Выдать VPN вручную', callback_data: 'admin_give' }],
            [{ text: '📢 Рассылка', callback_data: 'admin_broadcast' }],
          ]
        }
      }
    );
  });

  bot.on('callback_query', async (query) => {
    if (!isAdmin(query.from.id)) return;
    const id = query.from.id;
    const data = query.data;

    if (data === 'admin_stats') {
      try {
        const stats = await db.getStats();
        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(id,
          `📊 *Статистика*\n\n` +
          `👥 Всего пользователей: *${stats.totalUsers}*\n` +
          `💳 Успешных оплат: *${stats.totalPaid}*\n` +
          `💰 Выручка: *${(stats.totalRevenue || 0).toFixed(2)} TON*`,
          { parse_mode: 'Markdown' }
        );
      } catch (err) {
        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(id, `❌ Ошибка: ${err.message}`);
      }
    }

    if (data === 'admin_users') {
      try {
        const users = await db.getAllUsers();
        await bot.answerCallbackQuery(query.id);

        if (!users || users.length === 0) {
          return bot.sendMessage(id, 'Пользователей пока нет.');
        }

        let text = `👥 *Пользователи (${users.length}):*\n\n`;
        for (const u of users.slice(0, 30)) {
          text += `• ${u.telegram_id} — \`${u.marzban_username || 'нет'}\`\n`;
        }
        if (users.length > 30) text += `\n_...и ещё ${users.length - 30}_`;
        await bot.sendMessage(id, text, { parse_mode: 'Markdown' });
      } catch (err) {
        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(id, `❌ Ошибка: ${err.message}`);
      }
    }

    if (data === 'admin_give') {
      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(id,
        '➕ Отправь команду:\n`/give <telegram_id> <план>`\n\nПример: `/give 123456789 1m`\n\nДоступные планы: `1m` `3m` `6m` `12m`',
        { parse_mode: 'Markdown' }
      );
    }

    if (data === 'admin_broadcast') {
      await bot.answerCallbackQuery(query.id);
      await bot.sendMessage(id,
        '📢 Отправь команду:\n`/broadcast <текст>`',
        { parse_mode: 'Markdown' }
      );
    }
  });

  bot.onText(/\/give (\d+) (\w+)/, async (msg, match) => {
    if (!isAdmin(msg.from.id)) return;

    const targetId = parseInt(match[1]);
    const planKey = match[2];
    const plan = config.PLANS[planKey];

    if (!plan) {
      return bot.sendMessage(msg.from.id,
        `❌ Неизвестный тариф: ${planKey}\nДоступные: ${Object.keys(config.PLANS).join(', ')}`
      );
    }

    await bot.sendMessage(msg.from.id, `⏳ Активирую VPN для ${targetId}...`);

    try {
      await activateVPN(bot, targetId, planKey);
      await bot.sendMessage(msg.from.id, `✅ VPN выдан пользователю ${targetId} на тариф ${plan.label}`);
    } catch (err) {
      await bot.sendMessage(msg.from.id, `❌ Ошибка: ${err.message}`);
    }
  });

  bot.onText(/\/broadcast (.+)/, async (msg, match) => {
    if (!isAdmin(msg.from.id)) return;

    const text = match[1];
    const users = await db.getAllUsers();

    if (!users || users.length === 0) {
      return bot.sendMessage(msg.from.id, 'Пользователей пока нет.');
    }

    let sent = 0, failed = 0;
    await bot.sendMessage(msg.from.id, `📢 Рассылка начата для ${users.length} пользователей...`);

    for (const user of users) {
      try {
        await bot.sendMessage(user.telegram_id, text, { parse_mode: 'Markdown' });
        sent++;
      } catch {
        failed++;
      }
      await new Promise(r => setTimeout(r, 50));
    }

    await bot.sendMessage(msg.from.id, `✅ Рассылка завершена\n✉️ Доставлено: ${sent}\n❌ Ошибок: ${failed}`);
  });
}

async function activateVPN(bot, telegramId, planKey) {
  const plan = config.PLANS[planKey];
  const existingUser = await db.getUser(telegramId);

  let marzbanUser;

  if (existingUser && existingUser.marzban_username) {
    marzbanUser = await marzban.extendUser(existingUser.marzban_username, plan.days);
  } else {
    const username = `tg_${telegramId}_${Date.now()}`;
    marzbanUser = await marzban.createUser(username, plan.days);
    await db.createUser(telegramId, null, marzbanUser.username);
  }

  const links = await marzban.getUserLinks(marzbanUser.username);
  const configText = links.length > 0 ? links.join('\n') : marzban.getSubscriptionUrl(marzbanUser.username);
  const expireDate = new Date(marzbanUser.expire * 1000).toLocaleDateString('ru-RU');

  await bot.sendMessage(telegramId,
    `✅ *VPN активирован!*\n\n` +
    `📅 Действует до: *${expireDate}*\n\n` +
    `🔗 *Конфиг для подключения:*\n\`${configText}\`\n\n` +
    `_Скопируй конфиг и импортируй в Happ или V2rayNG_`,
    { parse_mode: 'Markdown' }
  );

  return marzbanUser;
}

module.exports = { register, activateVPN };