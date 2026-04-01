import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import adminRoutes from './routes/adminRoutes.js';
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

/** Production / staging frontends — set on Render, e.g. CORS_ORIGINS=https://demo-5p8y.onrender.com */
const extraAllowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const isAllowedOrigin = (origin) =>
  isLocalOrigin(origin) || extraAllowedOrigins.includes(origin);

app.use(
  cors({
    origin(origin, callback) {
      // Non-browser clients (curl, server-to-server) often omit Origin
      if (!origin) return callback(null, true);
      if (isAllowedOrigin(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
/** Plain-text liveness for uptime monitors (e.g. UptimeRobot) — must stay before notFound */
app.get('/ping', (req, res) => res.status(200).type('text/plain').send('pong'));
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
