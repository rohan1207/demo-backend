import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema(
  {
    fullName: String,
    email: String,
    phone: String,
    line1: String,
    city: String,
    state: String,
    postalCode: String,
    country: { type: String, default: 'India' },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true, timestamps: true }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
    phone: String,
    address: String,
    addresses: { type: [addressSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);
