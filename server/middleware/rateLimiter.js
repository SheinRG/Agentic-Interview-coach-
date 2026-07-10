import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for the /api/feedback endpoint.
 * 10 requests per hour per IP address.
 */
export const feedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many feedback requests — please try again in an hour.',
  },
});

/**
 * Rate limiter for authentication endpoints (login/register/google).
 * Mitigates brute-force and credential-stuffing. 20 attempts per 15 min per IP.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many attempts — please try again in a few minutes.',
  },
});

/**
 * Rate limiter for the paid speech endpoints (STT/TTS) to curb quota abuse.
 * 60 requests per 10 minutes per IP (an interview issues one call per question).
 */
export const mediaLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many speech requests — please slow down.',
  },
});
