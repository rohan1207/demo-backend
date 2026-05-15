import Order from '../models/Order.js';
import Product from '../models/Product.js';
import ReturnRequest from '../models/ReturnRequest.js';
import User from '../models/User.js';
import cloudinary from '../config/cloudinary.js';
import { getRazorpayClient } from '../config/razorpay.js';
import { sendOrderConfirmationMail, sendOrderStatusMail } from '../services/mail/mailService.js';
import crypto from 'crypto';

const ORDER_STATUSES = ['Placed', 'Confirmed', 'Packed', 'Shipped', 'Delivered', 'Cancelled'];

/** Public key id must match the account used to create orders — avoids live/test mismatch with frontend env. */
export const getRazorpayPublicKeyId = (req, res) => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!keyId) {
    return res.status(503).json({ message: 'Razorpay is not configured on server' });
  }
  res.json({ keyId });
};

export const createRazorpayOrder = async (req, res) => {
  const razorpay = getRazorpayClient();
  if (!razorpay) {
    return res.status(503).json({ message: 'Razorpay is not configured on server' });
  }
  const { amount } = req.body;
  if (!amount || Number(amount) <= 0) {
    return res.status(400).json({ message: 'Invalid amount' });
  }
  const order = await razorpay.orders.create({
    amount: Math.round(amount * 100),
    currency: 'INR',
    receipt: `receipt_${Date.now()}`,
  });
  res.status(201).json(order);
};

export const createOrder = async (req, res) => {
  const { items, razorpayOrderId, razorpayPaymentId, shippingAddress } = req.body;
  const normalized = [];
  let subtotal = 0;

  for (const item of items) {
    const product = await Product.findById(item.productId);
    if (!product) continue;
    const qty = Number(item.qty || 1);
    normalized.push({
      product: product._id,
      name: product.name,
      image: product.heroImage || product.images?.[0] || '',
      price: product.price,
      qty,
    });
    subtotal += product.price * qty;
  }

  const normalizedAddress = {
    fullName: shippingAddress?.fullName || req.user.name || '',
    email: shippingAddress?.email || req.user.email || '',
    phone: shippingAddress?.phone || req.user.phone || '',
    line1: shippingAddress?.line1 || '',
    city: shippingAddress?.city || '',
    state: shippingAddress?.state || '',
    postalCode: shippingAddress?.postalCode || '',
    country: shippingAddress?.country || 'India',
  };

  const order = await Order.create({
    user: req.user._id,
    items: normalized,
    subtotal,
    razorpayOrderId,
    razorpayPaymentId,
    shippingAddress: normalizedAddress,
    paymentStatus: razorpayPaymentId ? 'paid' : 'pending',
  });

  if (normalizedAddress.line1) {
    const user = await User.findById(req.user._id);
    if (user) {
      const duplicate = (user.addresses || []).find(
        (addr) =>
          addr.line1 === normalizedAddress.line1 &&
          addr.phone === normalizedAddress.phone &&
          addr.postalCode === normalizedAddress.postalCode
      );
      if (!duplicate) {
        user.addresses = [
          {
            ...normalizedAddress,
            isDefault: (user.addresses || []).length === 0,
          },
          ...(user.addresses || []),
        ];
      } else {
        duplicate.fullName = normalizedAddress.fullName;
        duplicate.email = normalizedAddress.email;
        duplicate.phone = normalizedAddress.phone;
        duplicate.city = normalizedAddress.city;
        duplicate.state = normalizedAddress.state;
        duplicate.country = normalizedAddress.country;
      }
      if (normalizedAddress.phone) user.phone = normalizedAddress.phone;
      await user.save();
    }
  }

  res.status(201).json(order);
  void sendOrderConfirmationMail(order, req.user);
};

export const verifyRazorpayPayment = async (req, res) => {
  if (!process.env.RAZORPAY_KEY_SECRET) {
    return res.status(503).json({ message: 'Razorpay is not configured on server' });
  }
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ message: 'Missing Razorpay verification fields' });
  }
  const body = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
    .update(body)
    .digest('hex');

  if (expected !== razorpay_signature) {
    return res.status(400).json({ verified: false, message: 'Invalid Razorpay signature' });
  }
  res.json({ verified: true });
};

export const getMyOrders = async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json(orders);
};

export const adminGetOrders = async (req, res) => {
  const orders = await Order.find().populate('user', 'name email').sort({ createdAt: -1 });
  res.json(orders);
};

export const updateOrderStatus = async (req, res) => {
  const { status } = req.body;
  if (!ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  const existing = await Order.findById(req.params.id);
  if (!existing) return res.status(404).json({ message: 'Order not found' });

  const previousStatus = existing.status;
  if (previousStatus === status) {
    const unchanged = await Order.findById(req.params.id).populate('user', 'name email');
    return res.json(unchanged);
  }

  const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true }).populate(
    'user',
    'name email'
  );

  res.json(order);
  void sendOrderStatusMail(order, previousStatus, status);
};

export const uploadReturnImage = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const b64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  const result = await cloudinary.uploader.upload(b64, { folder: 'T-REX/returns' });
  res.status(201).json({ url: result.secure_url, public_id: result.public_id });
};

export const createReturnRequest = async (req, res) => {
  const { orderId, reason, imageUrl } = req.body;
  if (!orderId || !reason) return res.status(400).json({ message: 'Order and reason are required' });
  const order = await Order.findOne({ _id: orderId, user: req.user._id });
  if (!order) return res.status(404).json({ message: 'Order not found' });
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const age = Date.now() - new Date(order.createdAt).getTime();
  if (age > sevenDaysMs) return res.status(400).json({ message: 'Order is not eligible for return' });
  const existing = await ReturnRequest.findOne({ user: req.user._id, order: order._id, status: 'Pending' });
  if (existing) return res.status(400).json({ message: 'Return request already submitted for this order' });
  const request = await ReturnRequest.create({
    user: req.user._id,
    order: order._id,
    reason: String(reason).trim(),
    imageUrl: imageUrl || '',
  });
  res.status(201).json(request);
};

export const getMyReturnRequests = async (req, res) => {
  const requests = await ReturnRequest.find({ user: req.user._id })
    .populate('order')
    .sort({ createdAt: -1 });
  res.json(requests);
};

export const adminGetReturnRequests = async (req, res) => {
  const requests = await ReturnRequest.find()
    .populate('user', 'name email phone addresses')
    .populate('order')
    .sort({ createdAt: -1 });
  res.json(requests);
};

export const adminUpdateReturnRequest = async (req, res) => {
  const { status, adminNote } = req.body;
  const allowed = ['Accepted', 'Declined'];
  if (!allowed.includes(status)) return res.status(400).json({ message: 'Invalid status' });
  const request = await ReturnRequest.findByIdAndUpdate(
    req.params.id,
    { status, adminNote: String(adminNote || '').trim() },
    { new: true }
  )
    .populate('user', 'name email phone')
    .populate('order');
  if (!request) return res.status(404).json({ message: 'Return request not found' });
  res.json(request);
};
