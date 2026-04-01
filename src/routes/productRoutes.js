import express from 'express';
import multer from 'multer';
import {
  adminGetProducts,
  createProduct,
  deleteProduct,
  getProductBySlug,
  getProducts,
  updateProduct,
  uploadProductImage,
} from '../controllers/productController.js';
import { adminOnly, protect } from '../middleware/auth.js';

const router = express.Router();
const upload = multer();

router.get('/admin/all', protect, adminOnly, adminGetProducts);
router.post('/admin', protect, adminOnly, createProduct);
router.put('/admin/:id', protect, adminOnly, updateProduct);
router.delete('/admin/:id', protect, adminOnly, deleteProduct);
router.post('/admin/upload', protect, adminOnly, upload.array('images', 10), uploadProductImage);
router.get('/', getProducts);
router.get('/:slug', getProductBySlug);

export default router;
