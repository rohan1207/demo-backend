import express from 'express';
import { getCustomers } from '../controllers/customerController.js';
import { adminOnly, protect } from '../middleware/auth.js';

const router = express.Router();

router.get('/admin/all', protect, adminOnly, getCustomers);

export default router;
