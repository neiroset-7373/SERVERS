import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { addBattlePoints } from '../services/emojiBattle.service.js';

const JWT_SECRET = process.env.JWT_SECRET || 'wintozo_super_secret_key_2024';

// Хранилище соединений
const connections = new Map(); // userId -> ws
const userSockets = new Map(); // ws -> userId

export const setupWebSocket = (wss) => {
  console.log('📡 WebSocket server initialized');

  wss.on('connection', async (ws, req) => {
    let userId = null;
    let heartbeatInterval = null;

    console.log('🔌 New WebSocket connection');

    // Heartbeat для поддержания соединения
    const startHeartbeat = () => {
      heartbeatInterval = setInterval(() => {
        if (ws.readyState === ws.OPEN) {
          ws.ping();
        }
      }, 30000); // каждые 30 секунд
    };

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Обработка сообщений
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'auth':
            userId = await handleAuth(ws, message.token);
            if (userId) {
              startHeartbeat();
            }
            break;

          case 'message':
            await handleMessage(ws, userId, message);
            break;

          case 'typing':
            handleTyping(userId, message);
            break;

          case 'call:start':
            handleCallStart(userId, message);
            break;

          case 'call:offer':
            handleCallOffer(userId, message);
            break;

          case 'call:answer':
            handleCallAnswer(userId, message);
            break;

          case 'call:ice-candidate':
            handleIceCandidate(userId, message);
            break;

          case 'call:end':
            handleCallEnd(userId, message);
            break;

          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            break;

          default:
            console.log('Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({ type: 'error', error: 'Invalid message format' }));
      }
    });

    // Закрытие соединения
    ws.on('close', async () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }

      if (userId) {
        connections.delete(userId);
        userSockets.delete(ws);

        // Обновляем статус пользователя
        try {
          await User.updateOne(
            { id: userId },
            { isOnline: false, lastSeen: new Date() }
          );

          // Уведомляем других пользователей
          broadcast({
            type: 'user:offline',
            userId,
            timestamp: new Date().toISOString()
          }, userId);
        } catch (error) {
          console.error('Error updating user status:', error);
        }

        console.log(`👋 User ${userId} disconnected`);
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  // Интервал проверки мёртвых соединений
  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      ws.isAlive = false;
    });
  }, 60000);
};

// Аутентификация WebSocket
async function handleAuth(ws, token) {
  try {
    if (!token) {
      ws.send(JSON.stringify({ type: 'auth:error', error: 'No token provided' }));
      return null;
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findOne({ id: decoded.userId });

    if (!user) {
      ws.send(JSON.stringify({ type: 'auth:error', error: 'User not found' }));
      return null;
    }

    // Закрываем старое соединение если есть
    const oldWs = connections.get(user.id);
    if (oldWs && oldWs !== ws) {
      oldWs.close();
    }

    // Сохраняем соединение
    connections.set(user.id, ws);
    userSockets.set(ws, user.id);
    ws.isAlive = true;

    // Обновляем статус
    user.isOnline = true;
    user.lastSeen = new Date();
    await user.save();

    // Отправляем подтверждение
    ws.send(JSON.stringify({
      type: 'auth:success',
      user: {
        id: user.id,
        username: user.username,
        emoji: user.emoji
      }
    }));

    // Уведомляем других
    broadcast({
      type: 'user:online',
      userId: user.id,
      username: user.username,
      timestamp: new Date().toISOString()
    }, user.id);

    console.log(`✅ User ${user.username} authenticated via WebSocket`);
    return user.id;
  } catch (error) {
    console.error('Auth error:', error);
    ws.send(JSON.stringify({ type: 'auth:error', error: 'Invalid token' }));
    return null;
  }
}

// Обработка сообщения
async function handleMessage(ws, senderId, message) {
  if (!senderId) {
    ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
    return;
  }

  const { receiverId, content, tempId } = message;

  // Отправляем получателю если онлайн
  const receiverWs = connections.get(receiverId);
  if (receiverWs && receiverWs.readyState === receiverWs.OPEN) {
    const sender = await User.findOne({ id: senderId }).select('id username emoji');
    
    receiverWs.send(JSON.stringify({
      type: 'message',
      message: {
        senderId,
        receiverId,
        content,
        sender,
        createdAt: new Date().toISOString()
      }
    }));
  }

  // Подтверждаем отправителю
  ws.send(JSON.stringify({
    type: 'message:sent',
    tempId,
    timestamp: new Date().toISOString()
  }));
}

// Обработка печати
function handleTyping(userId, message) {
  const { receiverId, isTyping } = message;
  
  const receiverWs = connections.get(receiverId);
  if (receiverWs && receiverWs.readyState === receiverWs.OPEN) {
    receiverWs.send(JSON.stringify({
      type: 'typing',
      userId,
      isTyping
    }));
  }
}

// WebRTC - начало звонка
async function handleCallStart(callerId, message) {
  const { receiverId, callType } = message; // callType: 'voice' | 'video'
  
  const receiverWs = connections.get(receiverId);
  if (!receiverWs || receiverWs.readyState !== receiverWs.OPEN) {
    const callerWs = connections.get(callerId);
    if (callerWs) {
      callerWs.send(JSON.stringify({
        type: 'call:unavailable',
        reason: 'User is offline'
      }));
    }
    return;
  }

  const caller = await User.findOne({ id: callerId }).select('id username emoji');

  receiverWs.send(JSON.stringify({
    type: 'call:incoming',
    callerId,
    caller,
    callType
  }));

  // Добавляем очки за звонок
  await addBattlePoints(callerId, 5);
  await User.updateOne({ id: callerId }, { $inc: { 'stats.calls': 1 } });
}

// WebRTC - offer
function handleCallOffer(senderId, message) {
  const { receiverId, offer } = message;
  
  const receiverWs = connections.get(receiverId);
  if (receiverWs && receiverWs.readyState === receiverWs.OPEN) {
    receiverWs.send(JSON.stringify({
      type: 'call:offer',
      senderId,
      offer
    }));
  }
}

// WebRTC - answer
function handleCallAnswer(senderId, message) {
  const { receiverId, answer } = message;
  
  const receiverWs = connections.get(receiverId);
  if (receiverWs && receiverWs.readyState === receiverWs.OPEN) {
    receiverWs.send(JSON.stringify({
      type: 'call:answer',
      senderId,
      answer
    }));
  }
}

// WebRTC - ICE candidate
function handleIceCandidate(senderId, message) {
  const { receiverId, candidate } = message;
  
  const receiverWs = connections.get(receiverId);
  if (receiverWs && receiverWs.readyState === receiverWs.OPEN) {
    receiverWs.send(JSON.stringify({
      type: 'call:ice-candidate',
      senderId,
      candidate
    }));
  }
}

// WebRTC - завершение звонка
function handleCallEnd(senderId, message) {
  const { receiverId, reason } = message;
  
  const receiverWs = connections.get(receiverId);
  if (receiverWs && receiverWs.readyState === receiverWs.OPEN) {
    receiverWs.send(JSON.stringify({
      type: 'call:end',
      senderId,
      reason
    }));
  }
}

// Broadcast всем кроме отправителя
function broadcast(message, excludeUserId = null) {
  connections.forEach((ws, oderId) => {
    if (userId !== excludeUserId && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });
}

// Отправить конкретному пользователю
export function sendToUser(userId, message) {
  const ws = connections.get(userId);
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
    return true;
  }
  return false;
}

// Получить онлайн пользователей
export function getOnlineUsers() {
  return Array.from(connections.keys());
}

export default { setupWebSocket, sendToUser, getOnlineUsers };
