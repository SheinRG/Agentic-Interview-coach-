import express from 'express';
import protect from '../middleware/auth.js';
import { mediaLimiter } from '../middleware/rateLimiter.js';
import { textToSpeech } from '../services/ttsService.js';

const router = express.Router();

/**
 * POST /api/tts
 * Converts text to speech and streams audio back. Authenticated + rate
 * limited to protect the paid TTS quota.
 * Body: { text: string }
 */
router.post('/', protect, mediaLimiter, async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ message: 'Text is required' });
    }

    // Limit text length to protect quota (max ~500 chars per request)
    const trimmedText = text.slice(0, 500);

    const audioBuffer = await textToSpeech(trimmedText);

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length,
      'Cache-Control': 'public, max-age=86400', // Cache for 24h to save quota
    });

    res.send(audioBuffer);
  } catch (err) {
    console.warn('⚠️ TTS error:', err.message);
    res.status(500).json({ message: 'Text-to-speech generation failed' });
  }
});

export default router;
