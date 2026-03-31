import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  id: {
    type: Number,
    unique: true,
    required: true
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 2,
    maxlength: 30
  },
  password: {
    type: String,
    required: true
  },
  emoji: {
    type: String,
    required: true,
    default: '😊'
  },
  theme: {
    type: String,
    default: 'dark',
    enum: ['dark', 'neon', 'pink', 'light', 'banana', 'forest', 'acid', 'white']
  },
  device: {
    type: String,
    default: 'phone',
    enum: ['phone', 'pc']
  },
  role: {
    type: String,
    default: 'user',
    enum: ['user', 'admin', 'system', 'moderator']
  },
  // Wintozo Pro
  subscription: {
    isPro: { type: Boolean, default: false },
    expiresAt: { type: Date, default: null },
    customId: { type: Number, default: null }
  },
  // Статистика активности
  stats: {
    messages: { type: Number, default: 0 },
    voiceMessages: { type: Number, default: 0 },
    videoMessages: { type: Number, default: 0 },
    calls: { type: Number, default: 0 },
    daysActive: { type: Number, default: 0 },
    lastActiveDate: { type: Date, default: null }
  },
  // Битва эмодзи
  battlePoints: {
    type: Number,
    default: 0
  },
  battleWins: {
    type: Number,
    default: 0
  },
  // Подписки на каналы
  channels: [{
    type: String
  }],
  // Баны
  ban: {
    isBanned: { type: Boolean, default: false },
    reason: { type: String, default: null },
    expiresAt: { type: Date, default: null } // null = infinity
  },
  // Онлайн статус
  isOnline: {
    type: Boolean,
    default: false
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Индексы для быстрого поиска
userSchema.index({ username: 1 });
userSchema.index({ id: 1 });
userSchema.index({ battlePoints: -1 });

// Метод для проверки Pro статуса
userSchema.methods.checkProStatus = function() {
  if (this.subscription.isPro && this.subscription.expiresAt) {
    if (new Date() > this.subscription.expiresAt) {
      this.subscription.isPro = false;
      this.subscription.expiresAt = null;
      return false;
    }
    return true;
  }
  return this.subscription.isPro;
};

// Метод для проверки бана
userSchema.methods.checkBanStatus = function() {
  if (this.ban.isBanned && this.ban.expiresAt) {
    if (new Date() > this.ban.expiresAt) {
      this.ban.isBanned = false;
      this.ban.reason = null;
      this.ban.expiresAt = null;
      return false;
    }
    return true;
  }
  return this.ban.isBanned;
};

const User = mongoose.model('User', userSchema);

export default User;
