import User from '../models/User.js';

export const getCustomers = async (req, res) => {
  const customers = await User.find({ role: 'customer' })
    .select('name email createdAt')
    .sort({ createdAt: -1 });
  res.json(customers);
};
