import cloudinary from '../config/cloudinary.js';
import Product from '../models/Product.js';

/** Derive Cloudinary public_id from a secure URL (image uploads only). */
function cloudinaryPublicIdFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  if (!url.includes('cloudinary.com')) return null;
  const parts = url.split('/upload/');
  if (parts.length < 2) return null;
  const path = parts[1].split('?')[0];
  const segments = path.split('/');
  let i = 0;
  while (i < segments.length) {
    const seg = segments[i];
    if (seg.includes(',')) {
      i += 1;
      continue;
    }
    if (/^v\d+$/i.test(seg)) {
      i += 1;
      continue;
    }
    break;
  }
  const rest = segments.slice(i).join('/');
  if (!rest) return null;
  return rest.replace(/\.[^.]+$/, '');
}

async function deleteCloudinaryAssetByUrl(url) {
  const publicId = cloudinaryPublicIdFromUrl(url);
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch (err) {
    console.warn('[cloudinary] destroy failed', publicId, err?.message || err);
  }
}

async function deleteProductImagesFromCloudinary(product) {
  const urls = new Set();
  if (product.heroImage) urls.add(product.heroImage);
  (product.galleryImages || []).forEach((u) => u && urls.add(u));
  (product.detailSections || []).forEach((s) => s?.image && urls.add(s.image));
  await Promise.allSettled([...urls].map((u) => deleteCloudinaryAssetByUrl(u)));
}

const parseJsonArray = (value, fallback = []) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
};

const cleanStringArray = (value) =>
  parseJsonArray(value)
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);

const normalizeProductPayload = (payload) => {
  const galleryImages = cleanStringArray(payload.galleryImages);
  const detailSections = parseJsonArray(payload.detailSections).filter(
    (section) =>
      section &&
      typeof section.title === 'string' &&
      typeof section.description === 'string' &&
      typeof section.image === 'string' &&
      section.title.trim() &&
      section.description.trim() &&
      section.image.trim()
  );

  return {
    name: payload.name?.trim(),
    slug: payload.slug?.trim(),
    shortName: payload.shortName?.trim() || '',
    description: payload.description?.trim() || '',
    price: Number(payload.price),
    compareAtPrice: Number(payload.compareAtPrice || 0),
    rating: Number(payload.rating || 0),
    reviewCount: Number(payload.reviewCount || 0),
    highlights: cleanStringArray(payload.highlights),
    colors: cleanStringArray(payload.colors),
    heroImage: payload.heroImage?.trim(),
    galleryImages,
    detailSections,
    isActive: payload.isActive === 'false' ? false : Boolean(payload.isActive ?? true),
  };
};

export const getProducts = async (req, res) => {
  const products = await Product.find({ isActive: true }).sort({ createdAt: -1 });
  res.json(products);
};

export const getProductBySlug = async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug, isActive: true });
  if (!product) return res.status(404).json({ message: 'Product not found' });
  res.json(product);
};

export const adminGetProducts = async (req, res) => {
  const products = await Product.find().sort({ createdAt: -1 });
  res.json(products);
};

export const createProduct = async (req, res) => {
  const data = normalizeProductPayload(req.body);
  const product = await Product.create(data);
  res.status(201).json(product);
};

export const updateProduct = async (req, res) => {
  const data = normalizeProductPayload(req.body);
  const product = await Product.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
  if (!product) return res.status(404).json({ message: 'Product not found' });
  res.json(product);
};

export const deleteProduct = async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: 'Product not found' });
  await deleteProductImagesFromCloudinary(product);
  await Product.findByIdAndDelete(req.params.id);
  res.json({ success: true });
};

export const uploadProductImage = async (req, res) => {
  const files = req.files || (req.file ? [req.file] : []);
  if (!files.length) return res.status(400).json({ message: 'No file uploaded' });
  const uploaded = [];
  for (const file of files) {
    const b64 = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    const result = await cloudinary.uploader.upload(b64, { folder: 'DRIP/products' });
    uploaded.push({ url: result.secure_url, public_id: result.public_id });
  }
  res.status(201).json({ files: uploaded, urls: uploaded.map((f) => f.url) });
};
