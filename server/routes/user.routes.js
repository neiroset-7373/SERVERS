import express from 'express';
import User from '../models/User.js';
import { auth } from '../middleware/auth.middleware.js';

const router = express.Router();

// Получить всех пользователей (для списка чатов)
router.get('/', auth, async (req, res) => {
  try {
    const users = await User.find({ 
      id: { $ne: req.userId },
      role: { $ne: 'system' }
    })
    .select('id username emoji isOnline lastSeen role subscription')
    .sort({ isOnline: -1, lastSeen: -1 });

    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Ошибка получения пользователей' });
  }
});

// Поиск пользователей
router.get('/search', auth, async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.json([]);
    }

    const users = await User.find({
      username: { $regex: q, $options: 'i' },
      id: { $ne: req.userId },
      role: { $ne: 'system' }
    })
    .select('id username emoji isOnline lastSeen role subscription')
    .limit(20);

    res.json(users);
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Ошибка поиска' });
  }
});

// Получить пользователя по ID
router.get('/:id', auth, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    
    const user = await User.findOne({ id: userId })
      .select('id username emoji isOnline lastSeen role subscription stats battlePoints battleWins');

    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Ошибка получения пользователя' });
  }
});

// Получить онлайн пользователей
router.get('/status/online', auth, async (req, res) => {
  try {
    const onlineUsers = await User.find({ isOnline: true })
      .select('id username emoji');

    res.json(onlineUsers);
  } catch (error) {
    console.error('Get online users error:', error);
    res.status(500).json({ error: 'Ошибка' });
  }
});

// Получить топ по битве эмодзи
router.get('/battle/top', auth, async (req, res) => {
  try {
    const topUsers = await User.find({ battlePoints: { $gt: 0 } })
      .select('id username emoji battlePoints battleWins subscription')
      .sort({ battlePoints: -1 })
      .limit(10);

    res.json(topUsers);
  } catch (error) {
    console.error('Get battle top error:', error);
    res.status(500).json({ error: 'Ошибка' });
  }
});

export default router;
