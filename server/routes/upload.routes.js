import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { auth } from '../middleware/auth.middleware.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Создаём папку uploads если её нет
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Подпапки для разных типов файлов
const subDirs = ['images', 'voice', 'video', 'files'];
subDirs.forEach(dir => {
  const dirPath = path.join(uploadsDir, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// Настройка хранилища
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let subDir = 'files';
    
    if (file.mimetype.startsWith('image/')) {
      subDir = 'images';
    } else if (file.mimetype.startsWith('audio/')) {
      subDir = 'voice';
    } else if (file.mimetype.startsWith('video/')) {
      subDir = 'video';
    }
    
    cb(null, path.join(uploadsDir, subDir));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

// Фильтр файлов
const fileFilter = (req, file, cb) => {
  // Максимум 50MB
  const allowedMimes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'audio/webm', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/wav',
    'video/webm', 'video/mp4', 'video/quicktime',
    'application/pdf', 'application/zip',
    'text/plain', 'application/json'
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Недопустимый тип файла'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  }
});

// Загрузка файла
router.post('/', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    // Определяем тип
    let type = 'file';
    if (req.file.mimetype.startsWith('image/')) type = 'image';
    else if (req.file.mimetype.startsWith('audio/')) type = 'voice';
    else if (req.file.mimetype.startsWith('video/')) type = 'video';

    // Формируем URL
    const subDir = type === 'image' ? 'images' : type;
    const fileUrl = `/uploads/${subDir}/${req.file.filename}`;

    res.json({
      success: true,
      file: {
        url: fileUrl,
        name: req.file.originalname,
        size: req.file.size,
        type,
        mimetype: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Ошибка загрузки файла' });
  }
});

// Загрузка голосового сообщения
router.post('/voice', auth, upload.single('voice'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    const fileUrl = `/uploads/voice/${req.file.filename}`;
    const duration = req.body.duration ? parseInt(req.body.duration) : null;

    res.json({
      success: true,
      file: {
        url: fileUrl,
        type: 'voice',
        duration,
        size: req.file.size
      }
    });
  } catch (error) {
    console.error('Voice upload error:', error);
    res.status(500).json({ error: 'Ошибка загрузки голосового сообщения' });
  }
});

// Загрузка видео сообщения
router.post('/video', auth, upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    const fileUrl = `/uploads/video/${req.file.filename}`;
    const duration = req.body.duration ? parseInt(req.body.duration) : null;

    res.json({
      success: true,
      file: {
        url: fileUrl,
        type: 'video',
        duration,
        size: req.file.size
      }
    });
  } catch (error) {
    console.error('Video upload error:', error);
    res.status(500).json({ error: 'Ошибка загрузки видео' });
  }
});

// Обработка ошибок multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Файл слишком большой (максимум 50MB)' });
    }
    return res.status(400).json({ error: error.message });
  }
  next(error);
});

export default router;
