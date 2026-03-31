import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const JWT_SECRET = process.env.JWT_SECRET || 'wintozo_super_secret_key_2024';

// Основной middleware авторизации
export const auth = async (req, res, next) => {
  try {
    // Получаем токен из cookie или header
    let token = req.cookies?.token;
    
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      }
    }

    if (!token) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }

    // Проверяем токен
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Находим пользователя
    const user = await User.findOne({ id: decoded.userId });
    
    if (!user) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    // Проверяем бан
    if (user.checkBanStatus()) {
      return res.status(403).json({ 
        error: 'Вы заблокированы',
        reason: user.ban.reason,
        expiresAt: user.ban.expiresAt
      });
    }

    // Обновляем Pro статус
    user.checkProStatus();
    await user.save();

    // Добавляем пользователя в request
    req.user = user;
    req.userId = user.id;
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Недействительный токен' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Токен истёк' });
    }
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Ошибка авторизации' });
  }
};

// Middleware для проверки админа
export const adminOnly = async (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Только для администратора' });
  }
  next();
};

// Middleware для проверки Pro подписки
export const proOnly = async (req, res, next) => {
  if (!req.user.subscription.isPro && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Только для Wintozo Pro' });
  }
  next();
};

// Генерация токена
export const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
};

// Опциональная авторизация (не выдаёт ошибку если нет токена)
export const optionalAuth = async (req, res, next) => {
  try {
    let token = req.cookies?.token;
    
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      }
    }

    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findOne({ id: decoded.userId });
      if (user) {
        req.user = user;
        req.userId = user.id;
      }
    }
    
    next();
  } catch (error) {
    // Игнорируем ошибки, просто идём дальше
    next();
  }
};

export default { auth, adminOnly, proOnly, generateToken, optionalAuth };
