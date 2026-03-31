import express from 'express';
import User from '../models/User.js';
import Message from '../models/Message.js';
import { auth, adminOnly } from '../middleware/auth.middleware.js';

const router = express.Router();

// Все роуты только для админа
router.use(auth, adminOnly);

// Выполнить команду
router.post('/command', async (req, res) => {
  try {
    const { command } = req.body;

    if (!command || !command.startsWith('/')) {
      return res.status(400).json({ error: 'Неверный формат команды' });
    }

    const result = await executeCommand(command);
    res.json(result);
  } catch (error) {
    console.error('Command error:', error);
    res.status(500).json({ error: error.message || 'Ошибка выполнения команды' });
  }
});

// Парсер и исполнитель команд
async function executeCommand(command) {
  const cmd = command.toLowerCase().trim();

  // /give w-pro to "username" for 5 days
  const giveProMatch = cmd.match(/\/give\s+w-pro\s+to\s+"([^"]+)"\s+for\s+(\d+)\s+days?/i);
  if (giveProMatch) {
    const [, username, days] = giveProMatch;
    return await giveProToUser(username, parseInt(days));
  }

  // /ban "username" infinity
  const banInfinityMatch = cmd.match(/\/ban\s+"([^"]+)"\s+infinity/i);
  if (banInfinityMatch) {
    const [, username] = banInfinityMatch;
    return await banUser(username, null, 'Заблокирован администратором');
  }

  // /ban "username" 1 day
  const banDaysMatch = cmd.match(/\/ban\s+"([^"]+)"\s+(\d+)\s+days?/i);
  if (banDaysMatch) {
    const [, username, days] = banDaysMatch;
    return await banUser(username, parseInt(days), 'Временная блокировка');
  }

  // /unban "username"
  const unbanMatch = cmd.match(/\/unban\s+"([^"]+)"/i);
  if (unbanMatch) {
    const [, username] = unbanMatch;
    return await unbanUser(username);
  }

  // /stats
  if (cmd === '/stats') {
    return await getStats();
  }

  // /users
  if (cmd === '/users') {
    return await getUsersList();
  }

  // /help
  if (cmd === '/help' || cmd === '/cmd') {
    return {
      success: true,
      message: 'Доступные команды',
      commands: [
        '/give w-pro to "username" for N days - выдать Pro',
        '/ban "username" infinity - заблокировать навсегда',
        '/ban "username" N days - временная блокировка',
        '/unban "username" - разблокировать',
        '/stats - статистика сервера',
        '/users - список пользователей',
        '/help - эта справка'
      ]
    };
  }

  return { success: false, error: 'Неизвестная команда. Введите /help' };
}

// Выдать Pro пользователю
async function giveProToUser(username, days) {
  const searchName = username.startsWith('@') ? username : `@${username}`;
  const user = await User.findOne({ 
    username: { $regex: new RegExp(`^${searchName}$`, 'i') } 
  });

  if (!user) {
    return { success: false, error: `Пользователь "${username}" не найден` };
  }

  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  
  user.subscription.isPro = true;
  user.subscription.expiresAt = expiresAt;
  await user.save();

  return { 
    success: true, 
    message: `✅ Выдан Wintozo Pro пользователю ${user.username} на ${days} дней`,
    user: { id: user.id, username: user.username },
    expiresAt
  };
}

// Заблокировать пользователя
async function banUser(username, days, reason) {
  const searchName = username.startsWith('@') ? username : `@${username}`;
  const user = await User.findOne({ 
    username: { $regex: new RegExp(`^${searchName}$`, 'i') } 
  });

  if (!user) {
    return { success: false, error: `Пользователь "${username}" не найден` };
  }

  if (user.role === 'admin') {
    return { success: false, error: 'Нельзя заблокировать администратора' };
  }

  user.ban.isBanned = true;
  user.ban.reason = reason;
  user.ban.expiresAt = days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;
  await user.save();

  const duration = days ? `на ${days} дней` : 'навсегда';
  return { 
    success: true, 
    message: `🚫 Пользователь ${user.username} заблокирован ${duration}`,
    user: { id: user.id, username: user.username }
  };
}

// Разблокировать пользователя
async function unbanUser(username) {
  const searchName = username.startsWith('@') ? username : `@${username}`;
  const user = await User.findOne({ 
    username: { $regex: new RegExp(`^${searchName}$`, 'i') } 
  });

  if (!user) {
    return { success: false, error: `Пользователь "${username}" не найден` };
  }

  user.ban.isBanned = false;
  user.ban.reason = null;
  user.ban.expiresAt = null;
  await user.save();

  return { 
    success: true, 
    message: `✅ Пользователь ${user.username} разблокирован`
  };
}

// Статистика сервера
async function getStats() {
  const totalUsers = await User.countDocuments({ role: 'user' });
  const onlineUsers = await User.countDocuments({ isOnline: true });
  const proUsers = await User.countDocuments({ 'subscription.isPro': true });
  const bannedUsers = await User.countDocuments({ 'ban.isBanned': true });
  const totalMessages = await Message.countDocuments();

  return {
    success: true,
    stats: {
      totalUsers,
      onlineUsers,
      proUsers,
      bannedUsers,
      totalMessages
    }
  };
}

// Список пользователей
async function getUsersList() {
  const users = await User.find({ role: { $ne: 'system' } })
    .select('id username role isOnline subscription.isPro ban.isBanned')
    .sort({ id: 1 })
    .limit(50);

  return {
    success: true,
    users: users.map(u => ({
      id: u.id,
      username: u.username,
      role: u.role,
      isOnline: u.isOnline,
      isPro: u.subscription?.isPro,
      isBanned: u.ban?.isBanned
    }))
  };
}

// Получить всех забаненных
router.get('/banned', async (req, res) => {
  try {
    const banned = await User.find({ 'ban.isBanned': true })
      .select('id username ban');
    res.json(banned);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка' });
  }
});

// Получить всех Pro пользователей
router.get('/pro-users', async (req, res) => {
  try {
    const proUsers = await User.find({ 'subscription.isPro': true })
      .select('id username subscription');
    res.json(proUsers);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка' });
  }
});

export default router;
