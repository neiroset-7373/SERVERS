import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cron from 'node-cron';
import path from 'path';
import { fileURLToPath } from 'url';

// Routes
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import messageRoutes from './routes/message.routes.js';
import channelRoutes from './routes/channel.routes.js';
import adminRoutes from './routes/admin.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import battleRoutes from './routes/battle.routes.js';

// WebSocket handler
import { setupWebSocket } from './ws/wsHandler.js';

// Services
import { resetEmojiBattle } from './services/emojiBattle.service.js';
import { createAdminUser, createBotUser, createDefaultChannels } from './services/init.service.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

// CORS настройки
const corsOptions = {
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://wintozoversion2final.vercel.app',
    /\.vercel\.app$/
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// Статические файлы (uploads)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/emoji-battle', battleRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root
app.get('/', (req, res) => {
  res.json({ 
    name: 'Wintozo Messenger API',
    version: '2.0.0',
    status: 'running'
  });
});

// WebSocket server
const wss = new WebSocketServer({ server });
setupWebSocket(wss);

// MongoDB подключение
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/wintozo';

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ MongoDB connected');
    
    // Создаём Admin, Bot и каналы при первом запуске
    await createAdminUser();
    await createBotUser();
    await createDefaultChannels();
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
  });

// Cron: сброс битвы эмодзи каждую неделю (воскресенье 23:59)
cron.schedule('59 23 * * 0', async () => {
  console.log('🔄 Resetting Emoji Battle...');
  await resetEmojiBattle();
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({ 
    error: err.message || 'Internal Server Error' 
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 Wintozo Server running on port ${PORT}`);
  console.log(`📡 WebSocket ready`);
});
