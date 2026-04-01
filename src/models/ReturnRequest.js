import mongoose from 'mongoose';

const returnRequestSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    reason: { type: String, required: true },
    imageUrl: String,
    status: {
      type: String,
      enum: ['Pending', 'Accepted', 'Declined'],
      default: 'Pending',
    },
    adminNote: String,
  },
  { timestamps: true }
);

export default mongoose.model('ReturnRequest', returnRequestSchema);
