import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { connectDB } from '../config/db.js';
import Product from '../models/Product.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

async function loadFrontendProducts() {
  const frontendProductsPath = path.resolve(__dirname, '../../../React-frontend/src/data/products.js');
  const frontendModule = await import(pathToFileURL(frontendProductsPath).href);
  return frontendModule.products || [];
}

function mapToDbProduct(product) {
  const images = Array.isArray(product.images) ? product.images : [];
  const heroImage = product.heroImage || images[0] || '';
  const galleryImages = product.galleryImages || images.slice(1);
  return {
    name: product.name,
    slug: product.slug,
    shortName: product.shortName || '',
    description: product.description || '',
    price: Number(product.price || 0),
    compareAtPrice: Number(product.compareAtPrice || 0),
    rating: Number(product.rating || 0),
    reviewCount: Number(product.reviewCount || 0),
    highlights: Array.isArray(product.highlights) ? product.highlights : [],
    colors: Array.isArray(product.colors) ? product.colors : [product.shortName].filter(Boolean),
    heroImage,
    galleryImages: Array.isArray(galleryImages) ? galleryImages : [],
    detailSections: Array.isArray(product.detailSections) ? product.detailSections : [],
    isActive: product.isActive !== false,
  };
}

async function run() {
  await connectDB();
  const frontendProducts = await loadFrontendProducts();
  const records = frontendProducts.map(mapToDbProduct);
  await Product.deleteMany({});
  if (records.length > 0) {
    await Product.insertMany(records);
  }
  console.log(`Synced ${records.length} products from React-frontend/src/data/products.js`);
  process.exit(0);
}

run().catch((error) => {
  console.error('Product sync failed:', error);
  process.exit(1);
});
