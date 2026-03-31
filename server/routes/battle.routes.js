import express from 'express';
import User from '../models/User.js';
import EmojiBattle from '../models/EmojiBattle.js';
import { auth } from '../middleware/auth.middleware.js';
import { getCurrentBattle, getTopPlayers } from '../services/emojiBattle.service.js';

const router = express.Router();

// Получить текущую битву
router.get('/current', auth, async (req, res) => {
  try {
    const battle = await getCurrentBattle();
    const topPlayers = await getTopPlayers(10);

    // Позиция текущего пользователя
    const allPlayers = await User.find({ battlePoints: { $gt: 0 } })
      .sort({ battlePoints: -1 })
      .select('id');
    
    const userRank = allPlayers.findIndex(p => p.id === req.userId) + 1;

    res.json({
      battle: {
        periodStart: battle?.periodStart || new Date(),
        periodEnd: battle?.periodEnd || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isActive: battle?.isActive ?? true
      },
      topPlayers,
      currentUser: {
        rank: userRank || null,
        points: req.user.battlePoints,
        emoji: req.user.emoji
      }
    });
  } catch (error) {
    console.error('Get battle error:', error);
    res.status(500).json({ error: 'Ошибка' });
  }
});

// Получить топ игроков
router.get('/top', auth, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const topPlayers = await getTopPlayers(parseInt(limit));
    res.json(topPlayers);
  } catch (error) {
    console.error('Get top error:', error);
    res.status(500).json({ error: 'Ошибка' });
  }
});

// Получить историю побед
router.get('/history', auth, async (req, res) => {
  try {
    const history = await EmojiBattle.find({ isActive: false })
      .sort({ periodEnd: -1 })
      .limit(10);
    res.json(history);
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Ошибка' });
  }
});

// Получить свою статистику
router.get('/my-stats', auth, async (req, res) => {
  try {
    res.json({
      points: req.user.battlePoints,
      wins: req.user.battleWins,
      emoji: req.user.emoji,
      stats: req.user.stats
    });
  } catch (error) {
    console.error('Get my stats error:', error);
    res.status(500).json({ error: 'Ошибка' });
  }
});

export default router;
