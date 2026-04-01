import bcrypt from 'bcryptjs';
import User from '../models/User.js';

export const seedAdmin = async () => {
  const email = process.env.ADMIN_EMAIL || 'admin123';
  const password = process.env.ADMIN_PASSWORD || 'admin123';

  const existing = await User.findOne({ email });
  if (existing) {
    // Keep access deterministic for local/dev usage
    const hash = await bcrypt.hash(password, 10);
    existing.password = hash;
    existing.role = 'admin';
    if (!existing.name) existing.name = 'Admin';
    await existing.save();
    console.log(`Admin updated: ${email}`);
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  await User.create({
    name: 'Admin',
    email,
    password: hash,
    role: 'admin',
  });
  console.log(`Admin seeded: ${email}`);
};
