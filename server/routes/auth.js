import { Router } from 'express';
import protect from '../middleware/auth.js';
import { register, login, logout, me, updateProfile, googleLogin } from '../controllers/authController.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/google', googleLogin);
router.post('/logout', logout);
router.get('/me', protect, me);
router.put('/update', protect, updateProfile);

export default router;
