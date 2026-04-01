import express from 'express';
import { dashboard } from '../controllers/adminController.js';
import { adminOnly, protect } from '../middleware/auth.js';

const router = express.Router();

router.get('/dashboard', protect, adminOnly, dashboard);

export default router;
