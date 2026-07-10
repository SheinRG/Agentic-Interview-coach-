import { Router } from 'express';
import protect from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { register, login, logout, me, updateProfile, googleLogin } from '../controllers/authController.js';

const router = Router();

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/google', authLimiter, googleLogin);
router.post('/logout', logout);
router.get('/me', protect, me);
router.put('/update', protect, updateProfile);

export default router;
