import express from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Channel from '../models/Channel.js';
import { auth, generateToken } from '../middleware/auth.middleware.js';

const router = express.Router();

// Получить следующий ID
const getNextUserId = async () => {
  const lastUser = await User.findOne({ role: 'user' }).sort({ id: -1 });
  return lastUser ? lastUser.id + 1 : 2; // 0 = bot, 1 = admin
};

// Регистрация
router.post('/register', async (req, res) => {
  try {
    const { username, password, emoji, theme, device } = req.body;

    // Валидация
    if (!username || !password) {
      return res.status(400).json({ error: 'Никнейм и пароль обязательны' });
    }

    if (username.length < 2 || username.length > 30) {
      return res.status(400).json({ error: 'Никнейм должен быть от 2 до 30 символов' });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: 'Пароль должен быть минимум 4 символа' });
    }

    // Проверяем существование
    const existingUser = await User.findOne({ 
      username: { $regex: new RegExp(`^${username}$`, 'i') } 
    });
    
    if (existingUser) {
      return res.status(400).json({ error: 'Этот никнейм уже занят' });
    }

    // Хешируем пароль
    const hashedPassword = await bcrypt.hash(password, 12);

    // Создаём пользователя
    const userId = await getNextUserId();
    
    // Определяем роль для @spidi_390
    let role = 'user';
    if (username.toLowerCase() === 'spidi_390' || username === '@spidi_390') {
      role = 'moderator';
    }

    const user = new User({
      id: userId,
      username: username.startsWith('@') ? username : `@${username}`,
      password: hashedPassword,
      emoji: emoji || '😊',
      theme: theme || 'dark',
      device: device || 'phone',
      role,
      channels: ['wintozo_official'] // Автоподписка на официальный канал
    });

    await user.save();

    // Добавляем в подписчики канала
    await Channel.updateOne(
      { id: 'wintozo_official' },
      { $addToSet: { subscribers: userId } }
    );

    // Генерируем токен
    const token = generateToken(userId);

    // Устанавливаем cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 дней
    });

    res.status(201).json({
      message: 'Регистрация успешна!',
      user: {
        id: user.id,
        username: user.username,
        emoji: user.emoji,
        theme: user.theme,
        device: user.device,
        role: user.role,
        subscription: user.subscription,
        channels: user.channels
      },
      token
    });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Ошибка регистрации' });
  }
});

// Вход
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Введите никнейм и пароль' });
    }

    // Ищем пользователя (с @ или без)
    const searchUsername = username.startsWith('@') ? username : `@${username}`;
    const user = await User.findOne({ 
      username: { $regex: new RegExp(`^${searchUsername}$`, 'i') } 
    });

    if (!user) {
      return res.status(400).json({ error: 'Пользователь не найден' });
    }

    // Проверяем бан
    if (user.checkBanStatus()) {
      return res.status(403).json({ 
        error: 'Вы заблокированы',
        reason: user.ban.reason,
        expiresAt: user.ban.expiresAt
      });
    }

    // Проверяем пароль
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Неверный пароль' });
    }

    // Обновляем статус онлайн
    user.isOnline = true;
    user.lastSeen = new Date();
    
    // Проверяем активность для Pro
    const today = new Date().toDateString();
    const lastActive = user.stats.lastActiveDate?.toDateString();
    
    if (today !== lastActive) {
      user.stats.daysActive += 1;
      user.stats.lastActiveDate = new Date();
      
      // Автоматическая выдача Pro за 7 дней активности
      if (user.stats.daysActive >= 7 && !user.subscription.isPro) {
        user.subscription.isPro = true;
        user.subscription.expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      }
    }
    
    await user.save();

    // Генерируем токен
    const token = generateToken(user.id);

    // Устанавливаем cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json({
      message: 'Вход выполнен!',
      user: {
        id: user.id,
        username: user.username,
        emoji: user.emoji,
        theme: user.theme,
        device: user.device,
        role: user.role,
        subscription: user.subscription,
        stats: user.stats,
        channels: user.channels,
        battlePoints: user.battlePoints
      },
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

// Получить текущего пользователя
router.get('/me', auth, async (req, res) => {
  try {
    const user = req.user;
    
    res.json({
      id: user.id,
      username: user.username,
      emoji: user.emoji,
      theme: user.theme,
      device: user.device,
      role: user.role,
      subscription: user.subscription,
      stats: user.stats,
      channels: user.channels,
      battlePoints: user.battlePoints,
      battleWins: user.battleWins,
      isOnline: user.isOnline,
      lastSeen: user.lastSeen
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Ошибка получения данных' });
  }
});

// Выход
router.post('/logout', auth, async (req, res) => {
  try {
    const user = req.user;
    user.isOnline = false;
    user.lastSeen = new Date();
    await user.save();

    res.clearCookie('token');
    res.json({ message: 'Вы вышли из аккаунта' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Ошибка выхода' });
  }
});

// Обновить тему
router.put('/theme', auth, async (req, res) => {
  try {
    const { theme } = req.body;
    const validThemes = ['dark', 'neon', 'pink', 'light', 'banana', 'forest', 'acid', 'white'];
    
    if (!validThemes.includes(theme)) {
      return res.status(400).json({ error: 'Недопустимая тема' });
    }

    req.user.theme = theme;
    await req.user.save();

    res.json({ message: 'Тема обновлена', theme });
  } catch (error) {
    console.error('Update theme error:', error);
    res.status(500).json({ error: 'Ошибка обновления темы' });
  }
});

// Обновить эмодзи
router.put('/emoji', auth, async (req, res) => {
  try {
    const { emoji } = req.body;
    
    if (!emoji) {
      return res.status(400).json({ error: 'Эмодзи обязателен' });
    }

    req.user.emoji = emoji;
    await req.user.save();

    res.json({ message: 'Эмодзи обновлён', emoji });
  } catch (error) {
    console.error('Update emoji error:', error);
    res.status(500).json({ error: 'Ошибка обновления эмодзи' });
  }
});

export default router;
