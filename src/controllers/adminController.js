import User from '../models/User.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';

export const dashboard = async (req, res) => {
  const [orders, customers, products] = await Promise.all([
    Order.countDocuments(),
    User.countDocuments({ role: 'customer' }),
    Product.countDocuments(),
  ]);

  const revenueAgg = await Order.aggregate([
    { $match: { status: { $ne: 'Cancelled' } } },
    { $group: { _id: null, total: { $sum: '$subtotal' } } },
  ]);

  res.json({
    orders,
    customers,
    products,
    revenue: revenueAgg[0]?.total || 0,
  });
};
