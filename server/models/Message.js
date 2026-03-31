import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  // Тип чата: 'private' или 'channel'
  chatType: {
    type: String,
    required: true,
    enum: ['private', 'channel']
  },
  // Для приватных сообщений
  senderId: {
    type: Number,
    required: true
  },
  receiverId: {
    type: Number,
    default: null // null для каналов
  },
  // Для каналов
  channelId: {
    type: String,
    default: null
  },
  // Контент
  content: {
    type: {
      type: String,
      required: true,
      enum: ['text', 'voice', 'video', 'file', 'image', 'system']
    },
    text: { type: String, default: null },
    fileUrl: { type: String, default: null },
    fileName: { type: String, default: null },
    fileSize: { type: Number, default: null },
    duration: { type: Number, default: null } // для голосовых/видео
  },
  // Мета
  isRead: {
    type: Boolean,
    default: false
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Индексы
messageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
messageSchema.index({ channelId: 1, createdAt: -1 });
messageSchema.index({ createdAt: -1 });

const Message = mongoose.model('Message', messageSchema);

export default Message;
