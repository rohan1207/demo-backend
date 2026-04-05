import express from 'express';
import multer from 'multer';
import {
  adminGetOrders,
  adminGetReturnRequests,
  adminUpdateReturnRequest,
  createOrder,
  createReturnRequest,
  createRazorpayOrder,
  getMyReturnRequests,
  getMyOrders,
  uploadReturnImage,
  verifyRazorpayPayment,
  updateOrderStatus,
} from '../controllers/orderController.js';
import { getMyOrderTracking } from '../controllers/logisticsController.js';
import { adminOnly, protect } from '../middleware/auth.js';

const router = express.Router();
const upload = multer();

router.post('/razorpay/create-order', protect, createRazorpayOrder);
router.post('/razorpay/verify', protect, verifyRazorpayPayment);
router.post('/', protect, createOrder);
router.get('/my', protect, getMyOrders);
router.get('/returns/my', protect, getMyReturnRequests);
router.post('/returns/upload', protect, upload.single('image'), uploadReturnImage);
router.post('/returns', protect, createReturnRequest);

router.get('/:id/tracking', protect, getMyOrderTracking);

router.get('/admin/all', protect, adminOnly, adminGetOrders);
router.patch('/admin/:id/status', protect, adminOnly, updateOrderStatus);
router.get('/admin/returns', protect, adminOnly, adminGetReturnRequests);
router.patch('/admin/returns/:id', protect, adminOnly, adminUpdateReturnRequest);

export default router;
