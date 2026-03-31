import { useEffect, useState } from 'react';
import * as api from './api';
import { wsClient } from './ws';
import { User, IncomingCall } from './types';
import { ThemeName, ThemeProvider, useTheme } from './context/ThemeContext';

import SplashScreen from './components/SplashScreen';
import DeviceSelect from './components/DeviceSelect';
import ThemePicker from './components/ThemePicker';
import EmojiPicker from './components/EmojiPicker';
import AuthScreen from './components/AuthScreen';
import ChannelSubscribe from './components/ChannelSubscribe';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import Error526 from './components/Error526';
import EmojiBattle from './components/EmojiBattle';

// Cookie helpers — без localStorage!
function setCookie(name: string, value: string, days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  document.cookie = `${name}=${value};expires=${d.toUTCString()};path=/;SameSite=None;Secure`;
}

function getCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return m ? m[2] : null;
}

function delCookie(name: string) {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/`;
}

type Screen =
  | 'splash'
  | 'device-select'
  | 'theme-pick'
  | 'auth'
  | 'emoji-pick'
  | 'channel-subscribe'
  | 'main'
  | 'error-526';

// Внутренний компонент с доступом к теме
function AppContent() {
  const { theme, setTheme } = useTheme();
  const [screen, setScreen] = useState<Screen>('splash');
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Состояние регистрации
  const [selectedDevice, setSelectedDevice] = useState('desktop');
  const [selectedTheme, setSelectedTheme] = useState<ThemeName>('dark');
  const [selectedEmoji, setSelectedEmoji] = useState('');

  // Состояние чата
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedUsername, setSelectedUsername] = useState('');

  // Звонки
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);

  // Битва эмодзи
  const [showBattle, setShowBattle] = useState(false);

  // Ошибка сервера
  const [serverError, setServerError] = useState(false);

  // При загрузке: проверка сессии
  useEffect(() => {
    const savedToken = getCookie('wtoken');
    if (savedToken) {
      api.setToken(savedToken);
      setToken(savedToken);
      api.getMe()
        .then((data) => {
          const u = data.user as User;
          setUser(u);
          // Применяем тему пользователя
          if (u.theme) {
            setTheme(u.theme as ThemeName);
          }
          setScreen('main');
          connectWS(savedToken);
        })
        .catch(() => {
          delCookie('wtoken');
          setTimeout(() => setScreen('device-select'), 2000);
        });
    } else {
      // Новый пользователь
      setTimeout(() => setScreen('device-select'), 2200);
    }
  }, []);

  const connectWS = (t: string) => {
    wsClient.connect(t);
    wsClient.onMessage((msg) => {
      if (msg.type === 'call_incoming') {
        setIncomingCall(msg);
      }
      if (msg.type === 'kicked') {
        handleLogout();
      }
      if (msg.type === 'ws_error') {
        setServerError(true);
      }
      if (msg.type === 'connected' || msg.type === 'auth_success') {
        setServerError(false);
      }
    });
  };

  // Успешная авторизация
  const handleAuthSuccess = (u: User, tok: string, isNew: boolean) => {
    setUser(u);
    setToken(tok);
    setCookie('wtoken', tok, 30);

    // Применяем выбранную тему
    setTheme(selectedTheme);

    if (isNew) {
      setScreen('emoji-pick');
    } else {
      connectWS(tok);
      setScreen('main');
    }
  };

  const handleEmojiSelect = async (emoji: string) => {
    setSelectedEmoji(emoji);
    // Эмодзи уже сохранён при регистрации, просто переходим дальше
    setUser((u) => u ? { ...u, emoji } : u);
    if (token) connectWS(token);
    setScreen('channel-subscribe');
  };

  const handleChannelSubscribeDone = () => {
    setScreen('main');
  };

  const handleLogout = async () => {
    wsClient.disconnect();
    delCookie('wtoken');
    api.setToken(null);
    setUser(null);
    setToken(null);
    setSelectedUserId(null);
    setScreen('device-select');
  };

  const handleSelectUser = (id: number, username: string) => {
    setSelectedUserId(id);
    setSelectedUsername(username);
  };

  const handleRetry = () => {
    setServerError(false);
    window.location.reload();
  };

  // Рендер экранов
  if (serverError && screen === 'main') {
    return <Error526 onRetry={handleRetry} />;
  }

  if (screen === 'splash') {
    return <SplashScreen />;
  }

  if (screen === 'device-select') {
    return (
      <DeviceSelect
        onSelect={(device) => {
          setSelectedDevice(device);
          setScreen('theme-pick');
        }}
      />
    );
  }

  if (screen === 'theme-pick') {
    return (
      <ThemePicker
        current={selectedTheme}
        onSelect={(themeName) => {
          setSelectedTheme(themeName);
          setTheme(themeName);
          setScreen('auth');
        }}
      />
    );
  }

  if (screen === 'auth') {
    return (
      <AuthScreen
        onSuccess={handleAuthSuccess}
        selectedEmoji={selectedEmoji}
        selectedTheme={selectedTheme}
        selectedDevice={selectedDevice}
      />
    );
  }

  if (screen === 'emoji-pick') {
    return <EmojiPicker onSelect={handleEmojiSelect} />;
  }

  if (screen === 'channel-subscribe') {
    return <ChannelSubscribe onDone={handleChannelSubscribeDone} />;
  }

  if (screen === 'main' && user) {
    return (
      <div style={{
        display: 'flex',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        fontFamily: "'Segoe UI', sans-serif",
        background: theme.bg,
        transition: 'background 0.4s ease',
      }}>
        <Sidebar
          user={user}
          selectedUserId={selectedUserId}
          onSelectUser={handleSelectUser}
          onLogout={handleLogout}
        />

        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {selectedUserId !== null ? (
            <ChatWindow
              user={user}
              targetUserId={selectedUserId}
              targetUsername={selectedUsername}
              incomingCall={incomingCall}
              onCallHandled={() => setIncomingCall(null)}
            />
          ) : (
            <EmptyChat user={user} onShowBattle={() => setShowBattle(true)} />
          )}
        </div>

        {showBattle && <EmojiBattle onClose={() => setShowBattle(false)} />}
      </div>
    );
  }

  return <SplashScreen />;
}

// Пустой чат
function EmptyChat({ user, onShowBattle }: { user: User; onShowBattle: () => void }) {
  const { theme } = useTheme();

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: theme.bg,
      flexDirection: 'column',
      gap: 0,
      transition: 'background 0.4s ease',
    }}>
      {/* Логотип */}
      <div style={{
        width: 100,
        height: 100,
        borderRadius: 28,
        background: theme.gradient,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 60,
        fontWeight: 900,
        color: '#fff',
        boxShadow: theme.glow,
        marginBottom: 24,
        animation: 'float 3s ease-in-out infinite',
      }}>
        W
      </div>

      <h2 style={{
        fontSize: 28,
        fontWeight: 800,
        background: theme.gradientText,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        marginBottom: 8,
      }}>
        Wintozo
      </h2>

      <p style={{
        color: theme.textMuted,
        fontSize: 14,
        marginBottom: 32,
      }}>
        Выбери чат чтобы начать общение
      </p>

      <button
        onClick={onShowBattle}
        style={{
          padding: '14px 32px',
          borderRadius: 14,
          border: `1px solid ${theme.border}`,
          background: theme.button,
          color: theme.text,
          cursor: 'pointer',
          fontSize: 15,
          fontFamily: 'inherit',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          transition: 'all 0.25s ease',
        }}
      >
        ⚔️ Битва Эмодзи
      </button>

      {user.role === 'admin' && (
        <div style={{
          marginTop: 24,
          padding: '16px 24px',
          borderRadius: 14,
          background: 'rgba(251,191,36,0.1)',
          border: '1px solid rgba(251,191,36,0.3)',
          color: '#fbbf24',
          fontSize: 14,
          textAlign: 'center',
          lineHeight: 1.6,
        }}>
          👑 Ты Администратор<br />
          <span style={{ color: theme.textMuted, fontSize: 12 }}>
            Напиши /cmd в чате с Wintozo Bot для консоли
          </span>
        </div>
      )}

      {user.pro && (
        <div style={{
          marginTop: 16,
          padding: '12px 20px',
          borderRadius: 12,
          background: 'rgba(251,191,36,0.08)',
          border: '1px solid rgba(251,191,36,0.2)',
          color: '#fbbf24',
          fontSize: 13,
        }}>
          💎 Wintozo Pro активна
        </div>
      )}

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
    </div>
  );
}

// Главный компонент с провайдером темы
export default function App() {
  return (
    <ThemeProvider initialTheme="dark">
      <AppContent />
    </ThemeProvider>
  );
}
