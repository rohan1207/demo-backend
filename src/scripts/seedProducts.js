import Product from '../models/Product.js';

/** Same paths as Vite `public/` — hero + gallery PNGs per product */
const SAGE_GALLERY = ['/product2.png', '/product2.png', '/product2.png'];
const PINK_GALLERY = ['/product1.png', '/product1.png', '/product1.png'];

export const seedProducts = async () => {
  const sage = {
    name: 'DRIP Tumbler - Sage Green',
    slug: 'sage-green',
    shortName: 'Sage Green',
    price: 2499,
    compareAtPrice: 3000,
    rating: 4.8,
    reviewCount: 129,
    description:
      'A premium daily-use tumbler with clean silhouette, food-grade materials, and all-day thermal retention.',
    highlights: [
      '1L total capacity',
      'Flip-top easy-sip lid',
      'Built-in silicone straw',
      'Stable grip base',
      'Leak-resistant carry design',
    ],
    heroImage: '/product2.png',
    galleryImages: SAGE_GALLERY,
    colors: ['Sage Green'],
    isActive: true,
  };

  const pink = {
    name: 'DRIP Tumbler - Blush Pink',
    slug: 'blush-pink',
    shortName: 'Blush Pink',
    price: 2499,
    compareAtPrice: 3000,
    rating: 4.7,
    reviewCount: 98,
    description:
      'A refined lifestyle tumbler in blush finish, engineered for smooth drinking, portability, and reliable insulation.',
    highlights: [
      '1L total capacity',
      'Direct + flip drinking options',
      'Soft-touch carry handle',
      'Noise-reducing base',
      'Premium stainless steel body',
    ],
    heroImage: '/product1.png',
    galleryImages: PINK_GALLERY,
    colors: ['Blush Pink'],
    isActive: true,
  };

  await Product.findOneAndUpdate({ slug: sage.slug }, sage, { upsert: true, new: true });
  await Product.findOneAndUpdate({ slug: pink.slug }, pink, { upsert: true, new: true });
  console.log('Products seeded: sage-green, blush-pink');
};
