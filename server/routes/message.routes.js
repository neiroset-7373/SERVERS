import express from 'express';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { auth } from '../middleware/auth.middleware.js';
import { addBattlePoints } from '../services/emojiBattle.service.js';

const router = express.Router();

// Получить историю сообщений с пользователем
router.get('/:userId', auth, async (req, res) => {
  try {
    const otherUserId = parseInt(req.params.userId);
    const { limit = 50, before } = req.query;

    const query = {
      chatType: 'private',
      $or: [
        { senderId: req.userId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: req.userId }
      ]
    };

    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    // Помечаем как прочитанные
    await Message.updateMany(
      { senderId: otherUserId, receiverId: req.userId, isRead: false },
      { isRead: true }
    );

    res.json(messages.reverse());
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Ошибка получения сообщений' });
  }
});

// Отправить сообщение
router.post('/', auth, async (req, res) => {
  try {
    const { receiverId, content } = req.body;

    if (!receiverId || !content || !content.type) {
      return res.status(400).json({ error: 'Недостаточно данных' });
    }

    // Проверяем получателя
    const receiver = await User.findOne({ id: receiverId });
    if (!receiver) {
      return res.status(404).json({ error: 'Получатель не найден' });
    }

    // Создаём сообщение
    const message = new Message({
      chatType: 'private',
      senderId: req.userId,
      receiverId,
      content
    });

    await message.save();

    // Обновляем статистику и очки битвы
    const user = req.user;
    user.stats.messages += 1;
    
    // Очки битвы
    let points = 1; // текст
    if (content.type === 'voice') {
      points = 2;
      user.stats.voiceMessages += 1;
    } else if (content.type === 'video') {
      points = 3;
      user.stats.videoMessages += 1;
    }
    
    await addBattlePoints(req.userId, points);
    await user.save();

    // Возвращаем сообщение с данными отправителя
    const responseMessage = {
      ...message.toObject(),
      sender: {
        id: user.id,
        username: user.username,
        emoji: user.emoji
      }
    };

    res.status(201).json(responseMessage);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Ошибка отправки сообщения' });
  }
});

// Получить непрочитанные сообщения
router.get('/unread/count', auth, async (req, res) => {
  try {
    const unreadCounts = await Message.aggregate([
      { 
        $match: { 
          receiverId: req.userId, 
          isRead: false,
          chatType: 'private'
        } 
      },
      { 
        $group: { 
          _id: '$senderId', 
          count: { $sum: 1 } 
        } 
      }
    ]);

    const result = {};
    unreadCounts.forEach(item => {
      result[item._id] = item.count;
    });

    res.json(result);
  } catch (error) {
    console.error('Get unread error:', error);
    res.status(500).json({ error: 'Ошибка' });
  }
});

// Пометить сообщения как прочитанные
router.put('/read/:userId', auth, async (req, res) => {
  try {
    const senderId = parseInt(req.params.userId);

    await Message.updateMany(
      { senderId, receiverId: req.userId, isRead: false },
      { isRead: true }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Ошибка' });
  }
});

// Удалить сообщение
router.delete('/:messageId', auth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);

    if (!message) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }

    // Можно удалить только своё сообщение
    if (message.senderId !== req.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Нет прав' });
    }

    await message.deleteOne();
    res.json({ success: true });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});

export default router;
