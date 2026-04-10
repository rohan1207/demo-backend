import Order from '../models/Order.js';
import {
  isLogisticsConfigured,
  buildBookingPayloadFromOrder,
  postBooking,
  trackConsignment,
  cancelOrder,
  getPincodeTracking,
  getStickerSize,
  getStickerPrintBuffer,
} from '../services/catalystLogistics.js';

function extractAwb(data) {
  if (!data || typeof data !== 'object') return '';
  const d = data.Response ?? data.response ?? data;
  if (typeof d === 'string') return '';
  return String(
    d.DocketNumber ??
      d.docketNumber ??
      d.AWB ??
      d.Awb ??
      data.DocketNumber ??
      data.docketNumber ??
      ''
  ).trim();
}

function extractOrderNumber(data) {
  if (!data || typeof data !== 'object') return '';
  const d = data.Response ?? data.response ?? data;
  if (typeof d === 'string') return '';
  return String(d.OrderNumber ?? d.orderNumber ?? data.OrderNumber ?? '').trim();
}

export const logisticsStatus = async (req, res) => {
  res.json({
    configured: isLogisticsConfigured(),
  });
};

export const adminBookOrder = async (req, res) => {
  if (!isLogisticsConfigured()) {
    return res.status(503).json({ message: 'Logistics API is not configured (check .env)' });
  }
  const order = await Order.findById(req.params.id).populate('user', 'name email');
  if (!order) return res.status(404).json({ message: 'Order not found' });
  if (order.paymentStatus !== 'paid') {
    return res.status(400).json({ message: 'Order must be paid before booking' });
  }
  if (order.logistics?.bookingStatus === 'booked' && order.logistics?.awb) {
    return res.status(400).json({ message: 'Order already has an AWB', awb: order.logistics.awb });
  }
  const addr = order.shippingAddress || {};
  if (!addr.postalCode || !addr.line1) {
    return res.status(400).json({ message: 'Shipping address needs line1 and postal code' });
  }

  order.logistics = order.logistics || {};
  order.logistics.bookingStatus = 'pending';
  order.logistics.lastError = '';
  await order.save();

  try {
    const body = buildBookingPayloadFromOrder(order);
    const { status, data } = await postBooking(body);
    const awb = extractAwb(data);
    const orderNum = extractOrderNumber(data);

    if (status >= 200 && status < 300 && awb) {
      order.logistics.awb = awb;
      order.logistics.carrierOrderNumber = orderNum || '';
      order.logistics.bookingStatus = 'booked';
      order.logistics.lastError = '';
      order.logistics.lastSyncedAt = new Date();
      await order.save();
      return res.json({
        ok: true,
        awb,
        carrierOrderNumber: orderNum,
        raw: data,
      });
    }

    const errMsg =
      (data && (data.Message || data.message || data.Error || JSON.stringify(data))) ||
      `HTTP ${status}`;
    order.logistics.bookingStatus = 'failed';
    order.logistics.lastError = String(errMsg).slice(0, 500);
    await order.save();
    return res.status(502).json({
      ok: false,
      message: 'Carrier rejected booking',
      detail: data,
      status,
    });
  } catch (e) {
    order.logistics.bookingStatus = 'failed';
    order.logistics.lastError = String(e.message || e).slice(0, 500);
    await order.save();
    return res.status(502).json({ message: e.message || 'Booking request failed' });
  }
};

export const adminRefreshTracking = async (req, res) => {
  if (!isLogisticsConfigured()) {
    return res.status(503).json({ message: 'Logistics API is not configured' });
  }
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Order not found' });
  const awb = order.logistics?.awb;
  if (!awb) return res.status(400).json({ message: 'No AWB on this order' });

  try {
    const { status, data } = await trackConsignment(awb, 'F');
    if (status >= 200 && status < 300) {
      order.logistics.lastTrackSummary = data;
      order.logistics.lastSyncedAt = new Date();
      await order.save();
      return res.json({ ok: true, tracking: data });
    }
    return res.status(502).json({ message: 'Tracking request failed', status, data });
  } catch (e) {
    return res.status(502).json({ message: e.message || 'Tracking failed' });
  }
};

export const adminCancelShipment = async (req, res) => {
  if (!isLogisticsConfigured()) {
    return res.status(503).json({ message: 'Logistics API is not configured' });
  }
  const { awb, reason } = req.body;
  if (!awb) return res.status(400).json({ message: 'awb is required' });
  try {
    const { status, data } = await cancelOrder(awb, reason);
    if (status >= 200 && status < 300) {
      const order = await Order.findOne({ 'logistics.awb': String(awb) });
      if (order) {
        order.logistics.bookingStatus = 'cancelled';
        order.logistics.lastError = '';
        await order.save();
      }
    }
    return res.json({ ok: status >= 200 && status < 300, status, data });
  } catch (e) {
    return res.status(502).json({ message: e.message || 'Cancel failed' });
  }
};

export const adminPincodeLookup = async (req, res) => {
  if (!isLogisticsConfigured()) {
    return res.status(503).json({ message: 'Logistics API is not configured' });
  }
  const pincode = req.body?.pincode || req.query?.pincode;
  if (!pincode) return res.status(400).json({ message: 'pincode required' });
  try {
    const { status, data } = await getPincodeTracking(String(pincode));
    return res.status(status >= 200 && status < 300 ? 200 : 502).json({ status, data });
  } catch (e) {
    return res.status(502).json({ message: e.message || 'Pincode lookup failed' });
  }
};

export const adminStickerSizes = async (req, res) => {
  if (!isLogisticsConfigured()) {
    return res.status(503).json({ message: 'Logistics API is not configured' });
  }
  try {
    const { status, data } = await getStickerSize(req.query.syncDateTime);
    return res.status(status >= 200 && status < 300 ? 200 : 502).json({ status, data });
  } catch (e) {
    return res.status(502).json({ message: e.message || 'GetStickerSize failed' });
  }
};

export const adminStickerPdf = async (req, res) => {
  if (!isLogisticsConfigured()) {
    return res.status(503).json({ message: 'Logistics API is not configured' });
  }
  const { awb, stickerSizeName } = req.query;
  if (!awb || !stickerSizeName) {
    return res.status(400).json({ message: 'awb and stickerSizeName query params required' });
  }
  try {
    const { data, headers } = await getStickerPrintBuffer(awb, stickerSizeName);
    const buf = Buffer.from(data || []);
    const isPdf =
      buf.length >= 4 &&
      buf[0] === 0x25 &&
      buf[1] === 0x50 &&
      buf[2] === 0x44 &&
      buf[3] === 0x46;
    const ct = (headers && headers['content-type']) || '';
    if (isPdf || ct.includes('application/pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="awb-${awb}.pdf"`);
      return res.send(buf);
    }
    return res.status(502).json({
      message: 'Expected PDF bytes from logistics service — please retry or contact support.',
      preview: buf.toString('utf8').slice(0, 300),
    });
  } catch (e) {
    const body = { message: e.message || 'Sticker print failed' };
    if (e.carrierStickerJson) body.carrier = e.carrierStickerJson;
    return res.status(502).json(body);
  }
};

export const getMyOrderTracking = async (req, res) => {
  if (!isLogisticsConfigured()) {
    return res.status(503).json({ message: 'Tracking unavailable' });
  }
  const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
  if (!order) return res.status(404).json({ message: 'Order not found' });
  const awb = order.logistics?.awb;
  if (!awb) {
    return res.json({ booked: false, message: 'Shipment has not been booked yet' });
  }
  try {
    const { status, data } = await trackConsignment(awb, 'F');
    if (status >= 200 && status < 300) {
      order.logistics.lastTrackSummary = data;
      order.logistics.lastSyncedAt = new Date();
      await order.save();
      return res.json({ booked: true, awb, tracking: data });
    }
    return res.status(502).json({ message: 'Tracking failed', data });
  } catch (e) {
    return res.status(502).json({ message: e.message || 'Tracking failed' });
  }
};
