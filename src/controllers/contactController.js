import { sendContactFormToAdmin } from '../services/mail/mailService.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const submitContact = async (req, res) => {
  try {
    if (req.body?._company || req.body?.website) {
      return res.status(200).json({ ok: true });
    }

    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const phone = String(req.body?.phone || '').trim();
    const message = String(req.body?.message || '').trim();

    if (!name || name.length > 120) {
      return res.status(400).json({ message: 'Please enter your name (max 120 characters).' });
    }
    if (!email || !EMAIL_RE.test(email) || email.length > 254) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }
    if (phone.length > 40) {
      return res.status(400).json({ message: 'Phone number is too long.' });
    }
    if (message.length < 10) {
      return res.status(400).json({ message: 'Please write a message (at least 10 characters).' });
    }
    if (message.length > 8000) {
      return res.status(400).json({ message: 'Message is too long (max 8000 characters).' });
    }

    const result = await sendContactFormToAdmin({ name, email, phone: phone || undefined, message });
    if (result.skipped) {
      return res.status(503).json({
        message:
          'Message could not be sent: email is not configured on the server. Please email us directly at thetrexstore.support@gmail.com',
      });
    }
    if (!result.ok) {
      return res.status(502).json({
        message: 'We could not send your message right now. Please try again later or email us directly.',
      });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[contact]', e);
    return res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};
