import User from '../models/User.js';
import EmojiBattle from '../models/EmojiBattle.js';

// Получить или создать текущую битву
export const getCurrentBattle = async () => {
  let battle = await EmojiBattle.findOne({ isActive: true });
  
  if (!battle) {
    // Создаём новую битву
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + 7); // 7 дней
    
    battle = new EmojiBattle({
      periodStart: now,
      periodEnd,
      isActive: true
    });
    await battle.save();
  }
  
  return battle;
};

// Добавить очки пользователю
export const addBattlePoints = async (userId, points) => {
  await User.updateOne(
    { id: userId },
    { $inc: { battlePoints: points } }
  );
};

// Получить топ игроков
export const getTopPlayers = async (limit = 10) => {
  const players = await User.find({ 
    battlePoints: { $gt: 0 },
    role: { $ne: 'system' }
  })
    .sort({ battlePoints: -1 })
    .limit(limit)
    .select('id username emoji battlePoints battleWins subscription');
  
  return players.map((p, index) => ({
    rank: index + 1,
    id: p.id,
    username: p.username,
    emoji: p.emoji,
    points: p.battlePoints,
    wins: p.battleWins,
    isPro: p.subscription?.isPro
  }));
};

// Сброс битвы (вызывается cron раз в неделю)
export const resetEmojiBattle = async () => {
  try {
    // Получаем текущую битву
    const battle = await EmojiBattle.findOne({ isActive: true });
    if (!battle) return;

    // Получаем топ-3
    const topPlayers = await User.find({ 
      battlePoints: { $gt: 0 },
      role: { $ne: 'system' }
    })
      .sort({ battlePoints: -1 })
      .limit(3);

    // Награждаем победителей
    const winners = [];
    
    for (let i = 0; i < topPlayers.length; i++) {
      const player = topPlayers[i];
      let prize = 'badge';
      
      if (i === 0) {
        // 1 место: трофей + Pro на 3 дня
        prize = 'trophy';
        player.subscription.isPro = true;
        player.subscription.expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      } else if (i === 1) {
        // 2 место: Pro на 2 дня
        prize = 'pro_3_days';
        player.subscription.isPro = true;
        player.subscription.expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      } else if (i === 2) {
        // 3 место: Pro на 1 день
        prize = 'badge';
        player.subscription.isPro = true;
        player.subscription.expiresAt = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);
      }
      
      player.battleWins += 1;
      await player.save();
      
      winners.push({
        rank: i + 1,
        userId: player.id,
        username: player.username,
        emoji: player.emoji,
        points: player.battlePoints,
        prize
      });
    }

    // Сохраняем результаты битвы
    battle.isActive = false;
    battle.winners = winners;
    await battle.save();

    // Сбрасываем очки всех пользователей
    await User.updateMany(
      { battlePoints: { $gt: 0 } },
      { battlePoints: 0 }
    );

    // Создаём новую битву
    const now = new Date();
    const newBattle = new EmojiBattle({
      periodStart: now,
      periodEnd: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      isActive: true
    });
    await newBattle.save();

    console.log('✅ Emoji Battle reset complete!');
    console.log('Winners:', winners);
    
    return winners;
  } catch (error) {
    console.error('Error resetting emoji battle:', error);
    throw error;
  }
};

export default {
  getCurrentBattle,
  addBattlePoints,
  getTopPlayers,
  resetEmojiBattle
};
