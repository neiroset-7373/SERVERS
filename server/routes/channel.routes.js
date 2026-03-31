import express from 'express';
import Channel from '../models/Channel.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { auth } from '../middleware/auth.middleware.js';

const router = express.Router();

// Получить все каналы
router.get('/', auth, async (req, res) => {
  try {
    const channels = await Channel.find()
      .select('id name description type avatar writeAccess subscribers');

    // Добавляем информацию о подписке текущего пользователя
    const result = channels.map(channel => ({
      ...channel.toObject(),
      isSubscribed: channel.subscribers.includes(req.userId),
      subscribersCount: channel.subscribers.length
    }));

    res.json(result);
  } catch (error) {
    console.error('Get channels error:', error);
    res.status(500).json({ error: 'Ошибка получения каналов' });
  }
});

// Получить канал по ID
router.get('/:channelId', auth, async (req, res) => {
  try {
    const channel = await Channel.findOne({ id: req.params.channelId });

    if (!channel) {
      return res.status(404).json({ error: 'Канал не найден' });
    }

    res.json({
      ...channel.toObject(),
      isSubscribed: channel.subscribers.includes(req.userId),
      subscribersCount: channel.subscribers.length
    });
  } catch (error) {
    console.error('Get channel error:', error);
    res.status(500).json({ error: 'Ошибка' });
  }
});

// Получить сообщения канала
router.get('/:channelId/messages', auth, async (req, res) => {
  try {
    const { limit = 50, before } = req.query;
    
    const channel = await Channel.findOne({ id: req.params.channelId });
    if (!channel) {
      return res.status(404).json({ error: 'Канал не найден' });
    }

    const query = {
      chatType: 'channel',
      channelId: req.params.channelId
    };

    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    // Получаем данные отправителей
    const senderIds = [...new Set(messages.map(m => m.senderId))];
    const senders = await User.find({ id: { $in: senderIds } })
      .select('id username emoji role subscription');

    const senderMap = {};
    senders.forEach(s => { senderMap[s.id] = s; });

    const result = messages.map(m => ({
      ...m.toObject(),
      sender: senderMap[m.senderId]
    }));

    res.json(result.reverse());
  } catch (error) {
    console.error('Get channel messages error:', error);
    res.status(500).json({ error: 'Ошибка' });
  }
});

// Отправить сообщение в канал
router.post('/:channelId/messages', auth, async (req, res) => {
  try {
    const { content } = req.body;
    const channelId = req.params.channelId;

    const channel = await Channel.findOne({ id: channelId });
    if (!channel) {
      return res.status(404).json({ error: 'Канал не найден' });
    }

    // Проверяем права на запись
    const canWrite = checkWriteAccess(channel, req.user);
    if (!canWrite) {
      return res.status(403).json({ error: 'Нет прав для отправки сообщений в этот канал' });
    }

    const message = new Message({
      chatType: 'channel',
      senderId: req.userId,
      channelId,
      content
    });

    await message.save();

    res.status(201).json({
      ...message.toObject(),
      sender: {
        id: req.user.id,
        username: req.user.username,
        emoji: req.user.emoji,
        role: req.user.role
      }
    });
  } catch (error) {
    console.error('Send channel message error:', error);
    res.status(500).json({ error: 'Ошибка' });
  }
});

// Проверка прав на запись
function checkWriteAccess(channel, user) {
  // Админ может писать везде
  if (user.role === 'admin') return true;

  // Проверяем тип доступа
  switch (channel.writeAccess) {
    case 'all':
      return true;
    case 'admins':
      return user.role === 'admin';
    case 'specific':
      // Проверяем username без @
      const username = user.username.replace('@', '').toLowerCase();
      return channel.allowedWriters.some(w => 
        w.toLowerCase() === username || w.toLowerCase() === user.username.toLowerCase()
      );
    default:
      return false;
  }
}

// Подписаться на канал
router.post('/:channelId/subscribe', auth, async (req, res) => {
  try {
    const channel = await Channel.findOne({ id: req.params.channelId });
    if (!channel) {
      return res.status(404).json({ error: 'Канал не найден' });
    }

    if (!channel.subscribers.includes(req.userId)) {
      channel.subscribers.push(req.userId);
      await channel.save();

      // Добавляем в список каналов пользователя
      req.user.channels.push(channel.id);
      await req.user.save();
    }

    res.json({ success: true, message: 'Вы подписались на канал' });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ error: 'Ошибка' });
  }
});

// Отписаться от канала
router.post('/:channelId/unsubscribe', auth, async (req, res) => {
  try {
    const channel = await Channel.findOne({ id: req.params.channelId });
    if (!channel) {
      return res.status(404).json({ error: 'Канал не найден' });
    }

    // Нельзя отписаться от официального канала
    if (channel.id === 'wintozo_official') {
      return res.status(400).json({ error: 'Нельзя отписаться от официального канала' });
    }

    channel.subscribers = channel.subscribers.filter(id => id !== req.userId);
    await channel.save();

    req.user.channels = req.user.channels.filter(id => id !== channel.id);
    await req.user.save();

    res.json({ success: true, message: 'Вы отписались от канала' });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    res.status(500).json({ error: 'Ошибка' });
  }
});

export default router;
