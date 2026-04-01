import express from 'express';
import { checkEmail, login, me, signup, updateMe } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/check-email', checkEmail);
router.get('/me', protect, me);
router.patch('/me', protect, updateMe);

export default router;
