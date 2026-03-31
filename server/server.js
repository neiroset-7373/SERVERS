const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ============ КОНФИГУРАЦИЯ (БЕЗ СЕКРЕТОВ) ============
const PORT = process.env.PORT || 3001;
const JWT_SECRET = 'wintozo_super_secret_key_2024_никому_не_говори';

// ============ ХРАНИЛИЩЕ (JSON ФАЙЛЫ) ============
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(path.join(__dirname, 'uploads'))) fs.mkdirSync(path.join(__dirname, 'uploads'));

// Функции для работы с данными
function loadData(file) {
  const filepath = path.join(DATA_DIR, `${file}.json`);
  if (!fs.existsSync(filepath)) return [];
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function saveData(file, data) {
  const filepath = path.join(DATA_DIR, `${file}.json`);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

// Инициализация данных
function initData() {
  // Создаём админа и бота если их нет
  let users = loadData('users');
  
  if (!users.find(u => u.id === 0)) {
    users.push({
      id: 0,
      odId: '@wintozo_bot',
      username: 'Wintozo Bot',
      password: '',
      emoji: '🤖',
      theme: 'dark',
      device: 'server',
      role: 'system',
      isOnline: true,
      createdAt: new Date().toISOString()
    });
  }
  
  if (!users.find(u => u.id === 1)) {
    users.push({
      id: 1,
      odId: '@Admin',
      username: 'Admin',
      password: bcrypt.hashSync('2015Nikita2015', 10),
      emoji: '👑',
      theme: 'neon',
      device: 'pc',
      role: 'admin',
      isOnline: false,
      createdAt: new Date().toISOString()
    });
  }
  
  saveData('users', users);
  
  // Создаём каналы
  let channels = loadData('channels');
  
  if (channels.length === 0) {
    channels = [
      {
        id: 'wintozo_official',
        name: '📢 Wintozo Official',
        description: 'Официальный канал Wintozo',
        type: 'channel',
        allowedWriters: ['admin'],
        subscribers: [],
        createdAt: new Date().toISOString()
      },
      {
        id: 'spidi',
        name: '📢 Spidi',
        description: 'Канал Spidi',
        type: 'channel',
        allowedWriters: ['admin', '@spidi_390'],
        subscribers: [],
        createdAt: new Date().toISOString()
      },
      {
        id: 'spidi_chat',
        name: '💬 Spidi Chat',
        description: 'Общий чат',
        type: 'chat',
        allowedWriters: ['all'],
        subscribers: [],
        createdAt: new Date().toISOString()
      }
    ];
    saveData('channels', channels);
  }
  
  // Инициализация битвы эмодзи
  let battle = loadData('battle');
  if (!battle.startDate) {
    battle = {
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      scores: {},
      winners: []
    };
    saveData('battle', battle);
  }
  
  console.log('✅ Данные инициализированы');
}

// ============ MIDDLEWARE ============
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// JWT проверка
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Нет токена' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const users = loadData('users');
    const user = users.find(u => u.id === decoded.id);
    
    if (!user) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }
    
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Неверный токен' });
  }
}

// ============ HEALTH CHECK ============
app.get('/', (req, res) => {
  res.json({ name: 'Wintozo Messenger API', version: '2.0.0', status: 'running' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============ АВТОРИЗАЦИЯ ============
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, emoji, theme, device } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Укажите никнейм и пароль' });
    }
    
    if (username.length < 2) {
      return res.status(400).json({ error: 'Никнейм минимум 2 символа' });
    }
    
    if (password.length < 4) {
      return res.status(400).json({ error: 'Пароль минимум 4 символа' });
    }
    
    let users = loadData('users');
    
    // Проверка на существование
    const existingUser = users.find(u => 
      u.username.toLowerCase() === username.toLowerCase() ||
      u.odId?.toLowerCase() === `@${username.toLowerCase()}`
    );
    
    if (existingUser) {
      return res.status(400).json({ error: 'Этот никнейм уже занят' });
    }
    
    // Создаём пользователя
    const maxId = Math.max(...users.map(u => u.id), 0);
    const newUser = {
      id: maxId + 1,
      odId: `@${username}`,
      username,
      password: bcrypt.hashSync(password, 10),
      emoji: emoji || '😀',
      theme: theme || 'dark',
      device: device || 'unknown',
      role: username.toLowerCase() === 'spidi_390' ? 'moderator' : 'user',
      isOnline: true,
      pro: null,
      channels: [],
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString()
    };
    
    users.push(newUser);
    saveData('users', users);
    
    // Создаём токен
    const token = jwt.sign({ id: newUser.id }, JWT_SECRET, { expiresIn: '30d' });
    
    // Отправляем приветствие от бота
    const messages = loadData('messages');
    messages.push({
      id: Date.now(),
      senderId: 0,
      receiverId: newUser.id,
      type: 'text',
      content: `Привет, ${username}! 👋\n\nДобро пожаловать в Wintozo Messenger!\n\n🎮 Участвуй в Битве Эмодзи\n💬 Общайся с друзьями\n📞 Звони бесплатно\n\nУдачи! 🚀`,
      createdAt: new Date().toISOString()
    });
    saveData('messages', messages);
    
    // Убираем пароль из ответа
    const { password: _, ...userResponse } = newUser;
    
    res.json({ user: userResponse, token });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Укажите никнейм и пароль' });
    }
    
    const users = loadData('users');
    const user = users.find(u => 
      u.username.toLowerCase() === username.toLowerCase() ||
      u.odId?.toLowerCase() === `@${username.toLowerCase()}`
    );
    
    if (!user) {
      return res.status(400).json({ error: 'Пользователь не найден' });
    }
    
    if (user.role === 'system') {
      return res.status(400).json({ error: 'Нельзя войти как бот' });
    }
    
    if (user.banned) {
      if (user.bannedUntil === 'infinity' || new Date(user.bannedUntil) > new Date()) {
        return res.status(403).json({ error: 'Вы заблокированы' });
      }
    }
    
    const isValid = bcrypt.compareSync(password, user.password);
    if (!isValid) {
      return res.status(400).json({ error: 'Неверный пароль' });
    }
    
    // Обновляем статус
    user.isOnline = true;
    user.lastActive = new Date().toISOString();
    saveData('users', users);
    
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });
    
    const { password: _, ...userResponse } = user;
    res.json({ user: userResponse, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const { password: _, ...userResponse } = req.user;
  res.json({ user: userResponse });
});

app.put('/api/auth/theme', authMiddleware, (req, res) => {
  const { theme } = req.body;
  const users = loadData('users');
  const user = users.find(u => u.id === req.user.id);
  
  if (user) {
    user.theme = theme;
    saveData('users', users);
  }
  
  res.json({ success: true });
});

// ============ ПОЛЬЗОВАТЕЛИ ============
app.get('/api/users', authMiddleware, (req, res) => {
  const users = loadData('users');
  const safeUsers = users
    .filter(u => u.id !== req.user.id)
    .map(({ password, ...u }) => u);
  
  res.json(safeUsers);
});

app.get('/api/users/:id', authMiddleware, (req, res) => {
  const users = loadData('users');
  const user = users.find(u => u.id === parseInt(req.params.id));
  
  if (!user) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }
  
  const { password, ...safeUser } = user;
  res.json(safeUser);
});

// ============ СООБЩЕНИЯ ============
app.get('/api/messages/:partnerId', authMiddleware, (req, res) => {
  const partnerId = parseInt(req.params.partnerId);
  const messages = loadData('messages');
  
  const chat = messages.filter(m => 
    (m.senderId === req.user.id && m.receiverId === partnerId) ||
    (m.senderId === partnerId && m.receiverId === req.user.id)
  );
  
  res.json(chat);
});

app.post('/api/messages', authMiddleware, (req, res) => {
  const { receiverId, type, content } = req.body;
  const messages = loadData('messages');
  
  const newMessage = {
    id: Date.now(),
    senderId: req.user.id,
    receiverId,
    type: type || 'text',
    content,
    createdAt: new Date().toISOString()
  };
  
  messages.push(newMessage);
  saveData('messages', messages);
  
  // Добавляем очки в битву
  addBattlePoints(req.user.emoji, type === 'voice' ? 2 : type === 'video' ? 3 : 1);
  
  // Отправляем через WebSocket
  broadcastToUser(receiverId, {
    type: 'message',
    message: newMessage
  });
  
  res.json(newMessage);
});

// ============ КАНАЛЫ ============
app.get('/api/channels', authMiddleware, (req, res) => {
  const channels = loadData('channels');
  res.json(channels);
});

app.get('/api/channels/:id/messages', authMiddleware, (req, res) => {
  const messages = loadData('messages');
  const channelMessages = messages.filter(m => m.channelId === req.params.id);
  res.json(channelMessages);
});

app.post('/api/channels/:id/messages', authMiddleware, (req, res) => {
  const channels = loadData('channels');
  const channel = channels.find(c => c.id === req.params.id);
  
  if (!channel) {
    return res.status(404).json({ error: 'Канал не найден' });
  }
  
  // Проверка прав
  const canWrite = 
    channel.allowedWriters.includes('all') ||
    (channel.allowedWriters.includes('admin') && req.user.role === 'admin') ||
    channel.allowedWriters.includes(req.user.odId);
  
  if (!canWrite) {
    return res.status(403).json({ error: 'Нет прав на отправку' });
  }
  
  const messages = loadData('messages');
  const newMessage = {
    id: Date.now(),
    channelId: req.params.id,
    senderId: req.user.id,
    senderName: req.user.username,
    senderEmoji: req.user.emoji,
    type: req.body.type || 'text',
    content: req.body.content,
    createdAt: new Date().toISOString()
  };
  
  messages.push(newMessage);
  saveData('messages', messages);
  
  // Broadcast в канал
  broadcastToChannel(req.params.id, {
    type: 'channel_message',
    message: newMessage
  });
  
  res.json(newMessage);
});

app.post('/api/channels/:id/subscribe', authMiddleware, (req, res) => {
  const channels = loadData('channels');
  const channel = channels.find(c => c.id === req.params.id);
  
  if (!channel) {
    return res.status(404).json({ error: 'Канал не найден' });
  }
  
  if (!channel.subscribers.includes(req.user.id)) {
    channel.subscribers.push(req.user.id);
    saveData('channels', channels);
  }
  
  // Обновляем пользователя
  const users = loadData('users');
  const user = users.find(u => u.id === req.user.id);
  if (user && !user.channels) user.channels = [];
  if (user && !user.channels.includes(req.params.id)) {
    user.channels.push(req.params.id);
    saveData('users', users);
  }
  
  res.json({ success: true });
});

// ============ ЗАГРУЗКА ФАЙЛОВ ============
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${ext}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

app.post('/api/upload', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Файл не загружен' });
  }
  
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ url: fileUrl, filename: req.file.originalname });
});

// ============ БИТВА ЭМОДЗИ ============
function addBattlePoints(emoji, points) {
  if (!emoji) return;
  
  let battle = loadData('battle');
  
  // Проверяем, не закончилась ли битва
  if (new Date(battle.endDate) < new Date()) {
    // Определяем победителя
    const scores = Object.entries(battle.scores);
    if (scores.length > 0) {
      scores.sort((a, b) => b[1] - a[1]);
      battle.winners.push({
        emoji: scores[0][0],
        points: scores[0][1],
        date: battle.endDate
      });
    }
    
    // Новая битва
    battle = {
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      scores: {},
      winners: battle.winners
    };
  }
  
  battle.scores[emoji] = (battle.scores[emoji] || 0) + points;
  saveData('battle', battle);
}

app.get('/api/emoji-battle/current', authMiddleware, (req, res) => {
  const battle = loadData('battle');
  res.json(battle);
});

// ============ АДМИН КОМАНДЫ ============
app.post('/api/admin/command', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Только для админа' });
  }
  
  const { command } = req.body;
  let users = loadData('users');
  
  // /give w-pro to "username" for 5 days
  const giveMatch = command.match(/\/give w-pro to "(.+)" for (\d+) days?/i);
  if (giveMatch) {
    const [, username, days] = giveMatch;
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    
    if (!user) {
      return res.json({ result: `❌ Пользователь "${username}" не найден` });
    }
    
    user.pro = {
      until: new Date(Date.now() + parseInt(days) * 24 * 60 * 60 * 1000).toISOString()
    };
    saveData('users', users);
    
    return res.json({ result: `✅ W-Pro выдан ${username} на ${days} дней` });
  }
  
  // /ban "username" infinity или /ban "username" 1 day
  const banMatch = command.match(/\/ban "(.+)" (infinity|\d+ days?)/i);
  if (banMatch) {
    const [, username, duration] = banMatch;
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    
    if (!user) {
      return res.json({ result: `❌ Пользователь "${username}" не найден` });
    }
    
    if (user.role === 'admin') {
      return res.json({ result: `❌ Нельзя забанить админа` });
    }
    
    user.banned = true;
    if (duration === 'infinity') {
      user.bannedUntil = 'infinity';
    } else {
      const days = parseInt(duration);
      user.bannedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    }
    saveData('users', users);
    
    return res.json({ result: `✅ ${username} забанен на ${duration}` });
  }
  
  // /unban "username"
  const unbanMatch = command.match(/\/unban "(.+)"/i);
  if (unbanMatch) {
    const [, username] = unbanMatch;
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    
    if (!user) {
      return res.json({ result: `❌ Пользователь "${username}" не найден` });
    }
    
    user.banned = false;
    user.bannedUntil = null;
    saveData('users', users);
    
    return res.json({ result: `✅ ${username} разбанен` });
  }
  
  return res.json({ result: '❌ Неизвестная команда' });
});

// ============ WEBSOCKET ============
const clients = new Map(); // id -> WebSocket

wss.on('connection', (ws) => {
  let userId = null;
  
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      
      // Авторизация
      if (msg.type === 'auth') {
        try {
          const decoded = jwt.verify(msg.token, JWT_SECRET);
          userId = decoded.id;
          clients.set(userId, ws);
          
          // Обновляем статус онлайн
          const users = loadData('users');
          const user = users.find(u => u.id === userId);
          if (user) {
            user.isOnline = true;
            user.lastActive = new Date().toISOString();
            saveData('users', users);
          }
          
          // Уведомляем других
          broadcast({
            type: 'user_online',
            userId: userId
          }, userId);
          
          ws.send(JSON.stringify({ type: 'auth_success' }));
        } catch (e) {
          ws.send(JSON.stringify({ type: 'auth_error', error: 'Invalid token' }));
        }
        return;
      }
      
      if (!userId) {
        ws.send(JSON.stringify({ type: 'error', error: 'Not authorized' }));
        return;
      }
      
      // Сообщение
      if (msg.type === 'message') {
        const receiverWs = clients.get(msg.receiverId);
        if (receiverWs && receiverWs.readyState === WebSocket.OPEN) {
          receiverWs.send(JSON.stringify({
            type: 'message',
            message: {
              id: Date.now(),
              senderId: userId,
              receiverId: msg.receiverId,
              type: msg.messageType || 'text',
              content: msg.content,
              createdAt: new Date().toISOString()
            }
          }));
        }
      }
      
      // Печатает
      if (msg.type === 'typing') {
        const receiverWs = clients.get(msg.receiverId);
        if (receiverWs && receiverWs.readyState === WebSocket.OPEN) {
          receiverWs.send(JSON.stringify({
            type: 'typing',
            userId: userId,
            isTyping: msg.isTyping
          }));
        }
      }
      
      // WebRTC звонки
      if (msg.type.startsWith('call:')) {
        const receiverWs = clients.get(msg.receiverId);
        if (receiverWs && receiverWs.readyState === WebSocket.OPEN) {
          receiverWs.send(JSON.stringify({
            ...msg,
            callerId: userId
          }));
        }
        
        // Добавляем очки за звонок
        if (msg.type === 'call:end') {
          const users = loadData('users');
          const user = users.find(u => u.id === userId);
          if (user) {
            addBattlePoints(user.emoji, 5);
          }
        }
      }
      
    } catch (e) {
      console.error('WS message error:', e);
    }
  });
  
  ws.on('close', () => {
    if (userId) {
      clients.delete(userId);
      
      // Обновляем статус оффлайн
      const users = loadData('users');
      const user = users.find(u => u.id === userId);
      if (user) {
        user.isOnline = false;
        user.lastActive = new Date().toISOString();
        saveData('users', users);
      }
      
      // Уведомляем других
      broadcast({
        type: 'user_offline',
        userId: userId
      }, userId);
    }
  });
});

// Ping/Pong для поддержания соединения
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

function broadcast(data, excludeId = null) {
  const msg = JSON.stringify(data);
  clients.forEach((ws, id) => {
    if (id !== excludeId && ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  });
}

function broadcastToUser(userId, data) {
  const ws = clients.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcastToChannel(channelId, data) {
  const channels = loadData('channels');
  const channel = channels.find(c => c.id === channelId);
  
  if (channel) {
    channel.subscribers.forEach(userId => {
      broadcastToUser(userId, data);
    });
  }
}

// ============ ЗАПУСК ============
initData();

server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
