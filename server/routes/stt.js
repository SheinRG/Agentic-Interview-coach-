import { Router } from 'express';
import multer from 'multer';
import protect from '../middleware/auth.js';
import { mediaLimiter } from '../middleware/rateLimiter.js';
import { handleSTT } from '../controllers/sttController.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB cap per audio clip
});

// Endpoint: POST /api/stt — authenticated + rate limited (paid Groq Whisper)
router.post('/', protect, mediaLimiter, upload.single('audio'), handleSTT);

export default router;
