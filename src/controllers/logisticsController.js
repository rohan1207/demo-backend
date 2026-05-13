import Order from '../models/Order.js';
import {
  isLogisticsConfigured,
  buildBookingPayloadFromOrder,
  postBooking,
  trackConsignment,
  trackConsignmentByRef,
  cancelOrder,
  getPincodeTracking,
  getStickerSize,
  getStickerPrintBuffer,
  getModeList,
  getProductList,
  getCountryList,
  getKycList,
  getBranchTracking,
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

function looksLikePlaceholderAwb(awb) {
  const s = String(awb || '').trim();
  if (!s) return false;
  return /^1000{5,}$/.test(s) || /^0+$/.test(s);
}

function extractCarrierError(data) {
  if (!data) return { message: '', code: '' };
  if (typeof data === 'string') return { message: data, code: '' };
  const d = data.Response ?? data.response ?? data;
  if (typeof d === 'string') {
    return { message: d.trim(), code: '' };
  }
  const message = String(
    d?.Message ??
      d?.message ??
      data.Message ??
      data.message ??
      d?.ResponseStatus?.Message ??
      data.ResponseStatus?.Message ??
      d?.Error ??
      data.Error ??
      ''
  ).trim();
  const code = String(
    d?.ErrorCode ??
      data.ErrorCode ??
      d?.ResponseStatus?.ErrorCode ??
      data.ResponseStatus?.ErrorCode ??
      ''
  ).trim();
  return { message, code };
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
    console.info('[LOGISTICS] adminBookOrder carrier result', {
      orderId: String(order._id),
      carrierHttpStatus: status,
      awb,
      orderNumber: orderNum,
      isTesting: body.IsTesting,
    });

    if (status >= 200 && status < 300 && awb) {
      if (looksLikePlaceholderAwb(awb)) {
        console.warn('[LOGISTICS] Placeholder-looking AWB returned by carrier', {
          orderId: String(order._id),
          awb,
          note: 'Likely UAT/demo docket. Switch to live credentials + IsTesting=0 for production AWBs.',
        });
      }
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

    if (status >= 200 && status < 300) {
      console.warn('[LOGISTICS] Booking HTTP success but no AWB in response', {
        orderId: String(order._id),
        carrierHttpStatus: status,
        responseType: typeof data,
        responsePreview:
          typeof data === 'string'
            ? data.slice(0, 500)
            : JSON.stringify(data || {}).slice(0, 500),
      });
    } else {
      console.warn('[LOGISTICS] Booking rejected by carrier HTTP', {
        orderId: String(order._id),
        carrierHttpStatus: status,
        responseType: typeof data,
        responsePreview:
          typeof data === 'string'
            ? data.slice(0, 500)
            : JSON.stringify(data || {}).slice(0, 500),
      });
    }

    const carrierError = extractCarrierError(data);
    const errMsg =
      carrierError.message ||
      carrierError.code ||
      (data && (data.Message || data.message || data.Error || JSON.stringify(data))) ||
      `HTTP ${status}`;
    order.logistics.bookingStatus = 'failed';
    order.logistics.lastError = String(errMsg).slice(0, 500);
    await order.save();
    const apiKeyHint =
      status === 403 ||
      /bad api key/i.test(String(errMsg)) ||
      /bad api key/i.test(typeof data === 'string' ? data : '')
        ? ' Confirm X-APPKEY for this host: demo PDF keys often work only on dev.CatalystSoft.in; live erp.obnexpress.com usually needs a separate app key from Catalyst.'
        : '';
    // 422 = carrier answered but did not create a booking (wrong key, agent, product, etc.)
    // 502 in catch = our server could not reach carrier (network/timeout)
    return res.status(422).json({
      ok: false,
      message: `${carrierError.message || (carrierError.code ? `Carrier rejected booking (${carrierError.code})` : 'Carrier rejected booking')}${apiKeyHint}`,
      carrierErrorCode: carrierError.code || undefined,
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
    const order = await Order.findOne({ 'logistics.awb': String(awb) });
    if (status >= 200 && status < 300) {
      if (order) {
        order.logistics.bookingStatus = 'cancelled';
        order.logistics.lastError = '';
        // UI/ops expects cancelled shipment to no longer present as active AWB.
        order.logistics.awb = '';
        order.logistics.carrierOrderNumber = '';
        await order.save();
      }
      return res.json({ ok: true, status, data });
    }
    if (order) {
      order.logistics.lastError = String(
        data?.Message || data?.message || data?.Error || `Cancel failed with status ${status}`
      ).slice(0, 500);
      await order.save();
    }
    return res.status(502).json({ ok: false, status, data, message: 'Carrier rejected cancellation' });
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

export const adminCarrierMeta = async (req, res) => {
  if (!isLogisticsConfigured()) {
    return res.status(503).json({ message: 'Logistics API is not configured' });
  }
  try {
    const [mode, product, sticker, country, kyc, branch] = await Promise.all([
      getModeList(),
      getProductList(),
      getStickerSize(req.query.syncDateTime),
      getCountryList(),
      getKycList(),
      getBranchTracking(),
    ]);
    return res.json({
      mode,
      product,
      sticker,
      country,
      kyc,
      branch,
    });
  } catch (e) {
    return res.status(502).json({ message: e.message || 'Carrier metadata fetch failed' });
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

export const adminTrackByReference = async (req, res) => {
  if (!isLogisticsConfigured()) {
    return res.status(503).json({ message: 'Logistics API is not configured' });
  }
  const referenceNo = req.body?.referenceNo || req.query?.referenceNo;
  const status = req.body?.status || req.query?.status || 'F';
  if (!referenceNo) return res.status(400).json({ message: 'referenceNo required' });
  try {
    const { status: httpStatus, data } = await trackConsignmentByRef(referenceNo, status);
    return res.status(httpStatus >= 200 && httpStatus < 300 ? 200 : 502).json({ status: httpStatus, data });
  } catch (e) {
    return res.status(502).json({ message: e.message || 'Track by reference failed' });
  }
};
