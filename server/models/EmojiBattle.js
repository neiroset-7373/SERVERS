import mongoose from 'mongoose';

const emojiBattleSchema = new mongoose.Schema({
  // Текущий период
  periodStart: {
    type: Date,
    required: true
  },
  periodEnd: {
    type: Date,
    required: true
  },
  // Активна ли битва
  isActive: {
    type: Boolean,
    default: true
  },
  // Победители
  winners: [{
    rank: Number,
    userId: Number,
    username: String,
    emoji: String,
    points: Number,
    prize: {
      type: String,
      enum: ['trophy', 'pro_3_days', 'badge']
    }
  }],
  // История
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const EmojiBattle = mongoose.model('EmojiBattle', emojiBattleSchema);

export default EmojiBattle;
