import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '1.1.1.1']);

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.js';
import sessionRoutes from './routes/sessions.js';
import feedbackRoutes from './routes/feedback.js';
import ttsRoutes from './routes/tts.js';
import resumeRoutes from './routes/resume.js';
import sttRoutes from './routes/stt.js';

import mongoose from 'mongoose';

dotenv.config({ path: '../.env' });

const app = express();
app.set('trust proxy', 1); // Trust Render's proxy for correct client IPs (rate limiting)
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not defined in .env file');
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET is not defined — refusing to start with an insecure default');
  process.exit(1);
}

// ── Database ────────────────────────────────────────────
mongoose
  .connect(MONGODB_URI)
  .then(() => console.log('📁 Connected to MongoDB'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// ── Security ────────────────────────────────────────────
app.use(helmet());

const isProduction = process.env.NODE_ENV === 'production';
app.use(cors({
  origin: function (origin, callback) {
    const allowed = [process.env.CLIENT_URL].filter(Boolean);
    // Allow localhost origins only outside production.
    const isLocalhost = !isProduction && (
      origin?.startsWith('http://localhost') || origin?.startsWith('http://127.0.0.1')
    );
    if (!origin || isLocalhost || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// ── Parsers ─────────────────────────────────────────────
// 15MB covers base64 webcam snapshots in feedback submissions while
// keeping the large-payload DoS surface small.
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));

// ── Health Check ────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ message: 'Orion AI Backend is Active 🚀', status: 'Healthy' });
});

// ── Routes ──────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/tts', ttsRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/api/stt', sttRoutes);

// ── Health check ────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Start ───────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log('API Key loaded successfully!');
});
