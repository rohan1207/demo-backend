import express from 'express';
import {
  logisticsStatus,
  adminBookOrder,
  adminRefreshTracking,
  adminTrackByReference,
  adminCancelShipment,
  adminPincodeLookup,
  adminCarrierMeta,
  adminStickerSizes,
  adminStickerPdf,
} from '../controllers/logisticsController.js';
import { adminOnly, protect } from '../middleware/auth.js';

const router = express.Router();

router.get('/status', protect, adminOnly, logisticsStatus);
router.post('/book/:id', protect, adminOnly, adminBookOrder);
router.get('/track/:id', protect, adminOnly, adminRefreshTracking);
router.post('/cancel', protect, adminOnly, adminCancelShipment);
router.post('/pincode', protect, adminOnly, adminPincodeLookup);
router.get('/meta', protect, adminOnly, adminCarrierMeta);
router.get('/sticker-sizes', protect, adminOnly, adminStickerSizes);
router.get('/sticker.pdf', protect, adminOnly, adminStickerPdf);
router.get('/track-by-reference', protect, adminOnly, adminTrackByReference);

export default router;
