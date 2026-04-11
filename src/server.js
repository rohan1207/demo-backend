import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import app from './app.js';
import { connectDB } from './config/db.js';
import { seedAdmin } from './scripts/seedAdmin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });

const INITIAL_PORT = Number(process.env.PORT) || 5000;

// Uptime Robot ping route
app.get('/', (req, res) => res.send('pong'));

const listenWithFallback = (port) =>
  new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`Backend running on port ${port} (GET /api/health, GET /ping for uptime checks)`);
      resolve(server);
    });

    server.on('error', (err) => {
      if (err?.code === 'EADDRINUSE') {
        console.warn(`Port ${port} is in use, trying ${port + 1}...`);
        return resolve(listenWithFallback(port + 1));
      }
      reject(err);
    });
  });

const start = async () => {
  await connectDB();
  await seedAdmin();
  await listenWithFallback(INITIAL_PORT);
};

start().catch((err) => {
  console.error(err);
  process.exit(1);
});