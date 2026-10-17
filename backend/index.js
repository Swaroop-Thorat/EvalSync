require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const mongoose = require('mongoose');

const connectDB = require('./config/db');
const seedAdmin = require('./utils/seedAdmin');

const auth = require('./middleware/auth');
const roleGuard = require('./middleware/roleGuard');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const teacherRoutes = require('./routes/teacher');
const studentRoutes = require('./routes/student');
const aiRoutes = require('./routes/ai');

const app = express();

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

const configuredOrigins = (process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map(o => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

const defaultOrigins = [
  'http://localhost:3000',
  'http://localhost:5000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5000'
];

const allowedOrigins = Array.from(new Set([...configuredOrigins, ...defaultOrigins]));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }
    const cleanOrigin = origin.replace(/\/$/, '');
    if (allowedOrigins.includes(cleanOrigin)) {
      return callback(null, true);
    }
    return callback(new Error('Blocked by CORS policy'));
  },
  credentials: true
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api', apiLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again in 15 minutes.' }
});
app.use('/api/auth/login', authLimiter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', auth, roleGuard(['admin']), adminRoutes);
app.use('/api/teacher', auth, roleGuard(['teacher']), teacherRoutes);
app.use('/api/assignments', auth, roleGuard(['teacher']), teacherRoutes);
app.use('/api/ai', auth, roleGuard(['teacher']), aiRoutes);
app.use('/api/student', auth, roleGuard(['student']), studentRoutes);
app.use('/api/submissions', auth, roleGuard(['student']), studentRoutes);

const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

app.get(['/', '/login', '/login/'], (req, res) => {
  res.sendFile(path.join(frontendPath, 'login/index.html'));
});
app.get(['/admin', '/admin/'], (req, res) => {
  res.sendFile(path.join(frontendPath, 'admin/index.html'));
});
app.get(['/teacher', '/teacher/'], (req, res) => {
  res.sendFile(path.join(frontendPath, 'teacher/index.html'));
});
app.get(['/student', '/student/'], (req, res) => {
  res.sendFile(path.join(frontendPath, 'student/index.html'));
});

app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  res.status(status).json({ message });
});

const PORT = process.env.PORT || 5000;
let server = null;

async function startServer() {
  await connectDB();
  await seedAdmin();
  server = app.listen(PORT, () => {
    console.log(`EvalSync Backend Server running on port ${PORT}`);
  });
  return server;
}

if (process.env.NODE_ENV !== 'test') {
  startServer().catch(err => {
    console.error('Startup failed:', err);
    process.exit(1);
  });
}

function handleShutdown() {
  if (server) {
    server.close(() => {
      mongoose.connection.close(false).then(() => {
        process.exit(0);
      });
    });
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);

module.exports = { app, startServer };
