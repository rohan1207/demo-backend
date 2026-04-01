import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { signToken } from '../utils/jwt.js';

export const signup = async (req, res) => {
  const { name, email, password } = req.body;
  const exists = await User.findOne({ email });
  if (exists) return res.status(400).json({ message: 'Email already exists' });

  const hashed = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, password: hashed });
  const token = signToken(user);
  res.status(201).json({
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone || '',
      addresses: user.addresses || [],
    },
  });
};

export const login = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');
  if (!user) return res.status(400).json({ message: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(400).json({ message: 'Invalid credentials' });
  const token = signToken(user);
  res.json({
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone || '',
      addresses: user.addresses || [],
    },
  });
};

export const me = async (req, res) => {
  res.json({ user: req.user });
};

export const checkEmail = async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ message: 'Email is required' });
  const exists = await User.exists({ email });
  res.json({ exists: Boolean(exists) });
};

export const updateMe = async (req, res) => {
  const allowed = ['name', 'phone'];
  const payload = {};
  for (const key of allowed) {
    if (typeof req.body[key] === 'string') payload[key] = req.body[key].trim();
  }
  const user = await User.findByIdAndUpdate(req.user._id, payload, { new: true }).select('-password');
  res.json({ user });
};
