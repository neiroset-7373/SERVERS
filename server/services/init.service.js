import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Channel from '../models/Channel.js';

// Создание админа при первом запуске
export const createAdminUser = async () => {
  try {
    const existingAdmin = await User.findOne({ id: 1 });
    
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash('2015Nikita2015', 12);
      
      const admin = new User({
        id: 1,
        username: '@Admin',
        password: hashedPassword,
        emoji: '👑',
        theme: 'neon',
        device: 'pc',
        role: 'admin',
        channels: ['wintozo_official', 'spidi', 'spidi_chat']
      });
      
      await admin.save();
      console.log('✅ Admin user created');
    } else {
      console.log('ℹ️ Admin already exists');
    }
  } catch (error) {
    console.error('Error creating admin:', error);
  }
};

// Создание Wintozo Bot
export const createBotUser = async () => {
  try {
    const existingBot = await User.findOne({ id: 0 });
    
    if (!existingBot) {
      const hashedPassword = await bcrypt.hash('wintozo_bot_secret_password', 12);
      
      const bot = new User({
        id: 0,
        username: 'Wintozo Bot',
        password: hashedPassword,
        emoji: '🤖',
        theme: 'neon',
        device: 'pc',
        role: 'system',
        channels: []
      });
      
      await bot.save();
      console.log('✅ Wintozo Bot created');
    } else {
      console.log('ℹ️ Bot already exists');
    }
  } catch (error) {
    console.error('Error creating bot:', error);
  }
};

// Создание каналов
export const createDefaultChannels = async () => {
  try {
    // Wintozo Official - только админ может писать
    const officialExists = await Channel.findOne({ id: 'wintozo_official' });
    if (!officialExists) {
      await Channel.create({
        id: 'wintozo_official',
        name: '📢 Wintozo Official',
        description: 'Официальный канал Wintozo',
        type: 'official',
        avatar: '📢',
        writeAccess: 'admins',
        allowedWriters: [],
        subscribers: [1], // Админ
        createdBy: 1
      });
      console.log('✅ Wintozo Official channel created');
    }

    // Spidi - админ и @spidi_390
    const spidiExists = await Channel.findOne({ id: 'spidi' });
    if (!spidiExists) {
      await Channel.create({
        id: 'spidi',
        name: '📢 Spidi',
        description: 'Канал Spidi',
        type: 'public',
        avatar: '🎮',
        writeAccess: 'specific',
        allowedWriters: ['Admin', 'spidi_390'],
        subscribers: [1],
        createdBy: 1
      });
      console.log('✅ Spidi channel created');
    }

    // Spidi Chat - все могут писать
    const spidiChatExists = await Channel.findOne({ id: 'spidi_chat' });
    if (!spidiChatExists) {
      await Channel.create({
        id: 'spidi_chat',
        name: '💬 Spidi Chat',
        description: 'Чат Spidi для всех',
        type: 'public',
        avatar: '💬',
        writeAccess: 'all',
        allowedWriters: [],
        subscribers: [1],
        createdBy: 1
      });
      console.log('✅ Spidi Chat channel created');
    }

  } catch (error) {
    console.error('Error creating channels:', error);
  }
};

// Инициализация всего
export const initializeApp = async () => {
  await createAdminUser();
  await createBotUser();
  await createDefaultChannels();
};

export default {
  createAdminUser,
  createBotUser,
  createDefaultChannels,
  initializeApp
};
