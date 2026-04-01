import mongoose from 'mongoose';

const detailSectionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    image: { type: String, required: true },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    shortName: String,
    description: String,
    price: { type: Number, required: true },
    compareAtPrice: Number,
    rating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    highlights: [String],
    heroImage: { type: String, required: true },
    galleryImages: { type: [String], default: [] },
    detailSections: { type: [detailSectionSchema], default: [] },
    colors: [String],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('Product', productSchema);
