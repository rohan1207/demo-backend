import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: String,
    image: String,
    price: Number,
    qty: Number,
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: [orderItemSchema],
    subtotal: Number,
    paymentMethod: { type: String, default: 'razorpay' },
    paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
    razorpayOrderId: String,
    razorpayPaymentId: String,
    status: {
      type: String,
      enum: ['Placed', 'Confirmed', 'Packed', 'Shipped', 'Delivered', 'Cancelled'],
      default: 'Placed',
    },
    shippingAddress: {
      fullName: String,
      email: String,
      phone: String,
      line1: String,
      city: String,
      state: String,
      postalCode: String,
      country: { type: String, default: 'India' },
    },
    /** CatalystSoft / Click2Pick (CustomerRestAPI) */
    logistics: {
      awb: { type: String, default: '' },
      carrierOrderNumber: { type: String, default: '' },
      bookingStatus: {
        type: String,
        enum: ['none', 'pending', 'booked', 'failed', 'cancelled'],
        default: 'none',
      },
      lastError: { type: String, default: '' },
      lastTrackSummary: { type: mongoose.Schema.Types.Mixed },
      lastSyncedAt: { type: Date },
    },
  },
  { timestamps: true }
);

export default mongoose.model('Order', orderSchema);
