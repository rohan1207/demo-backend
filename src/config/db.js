import mongoose from 'mongoose';

export const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('Mongo URI missing. Set MONGO_URI (or MONGODB_URI) in backend/.env');
  }
  await mongoose.connect(mongoUri);
  console.log('MongoDB connected');
};
