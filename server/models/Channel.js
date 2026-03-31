import mongoose from 'mongoose';

const channelSchema = new mongoose.Schema({
  id: {
    type: String,
    unique: true,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    required: true,
    enum: ['official', 'public', 'private']
  },
  avatar: {
    type: String,
    default: '📢'
  },
  // Кто может писать
  writeAccess: {
    type: String,
    enum: ['all', 'admins', 'specific'],
    default: 'all'
  },
  // Список пользователей с правом писать (если writeAccess = 'specific')
  allowedWriters: [{
    type: String // usernames
  }],
  // Подписчики
  subscribers: [{
    type: Number // user ids
  }],
  // Создатель
  createdBy: {
    type: Number,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Channel = mongoose.model('Channel', channelSchema);

export default Channel;
