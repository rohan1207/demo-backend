import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import adminRoutes from './routes/adminRoutes.js';
import logisticsRoutes from './routes/logisticsRoutes.js';
import authRoutes from './routes/authRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import productRoutes from './routes/productRoutes.js';
import { errorHandler, notFound } from './middleware/error.js';

dotenv.config();

const app = express();

/** Local dev */
const isLocalOrigin = (origin) =>
  /^https?:\/\/localhost(?::\d+)?$/.test(origin) ||
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/.test(origin);

const normalizeOrigin = (origin) => String(origin || '').trim().replace(/\/+$/, '');

/** Production defaults + env-based allowlist */
const defaultAllowedOrigins = [
  'https://thetrexstore.com',
  'https://www.thetrexstore.com',
];

/** Set on Render, e.g. CORS_ORIGINS=https://demo-5p8y.onrender.com,https://thetrexstore.com */
const extraAllowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);

const allowedOriginsSet = new Set([...defaultAllowedOrigins.map(normalizeOrigin), ...extraAllowedOrigins]);

const isAllowedOrigin = (origin) =>
  isLocalOrigin(origin) || allowedOriginsSet.has(normalizeOrigin(origin));

const corsOptions = {
  origin(origin, callback) {
    // Non-browser clients (curl, server-to-server) often omit Origin
    if (!origin) return callback(null, true);
    if (isAllowedOrigin(origin)) return callback(null, true);
    console.warn(`[CORS] Blocked origin: ${origin}`);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
/** Plain-text liveness for uptime monitors (e.g. UptimeRobot) — must stay before notFound */
app.get('/ping', (req, res) => res.status(200).type('text/plain').send('pong'));
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/logistics', logisticsRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
