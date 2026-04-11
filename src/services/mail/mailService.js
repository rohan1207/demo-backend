import { Resend } from 'resend';
import {
  buildContactNotificationEmail,
  buildOrderConfirmationEmail,
  buildOrderStatusEmail,
} from './mailTemplates.js';

let resendSingleton = null;

function getResend() {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  if (!resendSingleton) resendSingleton = new Resend(key);
  return resendSingleton;
}

export function isMailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM_EMAIL?.trim());
}

function storeName() {
  return (process.env.STORE_PUBLIC_NAME || 'T-REX Store').trim();
}

function frontendUrl() {
  return (process.env.FRONTEND_PUBLIC_URL || '').trim();
}

function defaultReplyTo() {
  return (process.env.RESEND_REPLY_TO || 'thetrexstore.support@gmail.com').trim();
}

function adminInbox() {
  return (process.env.MAIL_ADMIN_INBOX || 'thetrexstore.support@gmail.com').trim();
}

/**
 * Send one email. Never throws — logs errors so HTTP handlers stay reliable.
 * @param {{ to: string | string[]; subject: string; html: string; text?: string; replyTo?: string | null }} opts
 */
export async function sendTransactionalMail(opts) {
  const { to, subject, html, text, replyTo } = opts;
  if (!isMailConfigured()) {
    console.warn('[mail] Skipped send (RESEND_API_KEY or RESEND_FROM_EMAIL missing):', subject);
    return { ok: false, skipped: true };
  }
  const resend = getResend();
  const from = process.env.RESEND_FROM_EMAIL.trim();

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text: text || undefined,
      replyTo: replyTo || undefined,
    });
    if (error) {
      console.error('[mail] Resend error:', error);
      return { ok: false, error };
    }
    return { ok: true, id: data?.id };
  } catch (e) {
    console.error('[mail] Send failed:', e?.message || e);
    return { ok: false, error: e };
  }
}

/**
 * @param {import('mongoose').Document} order
 * @param {{ email?: string }} fallbackUser
 */
export async function sendOrderConfirmationMail(order, fallbackUser = {}) {
  const doc = order?.toObject?.() ? order.toObject() : order;
  const to =
    (doc.shippingAddress?.email && String(doc.shippingAddress.email).trim()) ||
    (fallbackUser?.email && String(fallbackUser.email).trim());
  if (!to) {
    console.warn('[mail] No recipient for order confirmation');
    return { ok: false, skipped: true };
  }
  if (doc.paymentStatus !== 'paid') {
    return { ok: false, skipped: true };
  }

  const { subject, html, text } = buildOrderConfirmationEmail({
    order: doc,
    storeName: storeName(),
    frontendUrl: frontendUrl() || undefined,
  });

  return sendTransactionalMail({
    to,
    subject,
    html,
    text,
    replyTo: defaultReplyTo(),
  });
}

/**
 * @param {import('mongoose').Document} order populated user optional
 * @param {string} previousStatus
 * @param {string} newStatus
 */
export async function sendOrderStatusMail(order, previousStatus, newStatus) {
  if (previousStatus === newStatus) return { ok: false, skipped: true };

  const doc = typeof order?.toObject === 'function' ? order.toObject() : order;
  const userEmail = doc.user?.email;
  const shipEmail = doc.shippingAddress?.email;
  const to = (shipEmail && String(shipEmail).trim()) || (userEmail && String(userEmail).trim());
  if (!to) {
    console.warn('[mail] No recipient for status update');
    return { ok: false, skipped: true };
  }

  const { subject, html, text } = buildOrderStatusEmail({
    order: doc,
    previousStatus,
    newStatus,
    storeName: storeName(),
    frontendUrl: frontendUrl() || undefined,
  });

  return sendTransactionalMail({
    to,
    subject,
    html,
    text,
    replyTo: defaultReplyTo(),
  });
}

/**
 * @param {{ name: string; email: string; phone?: string; message: string }} payload
 */
export async function sendContactFormToAdmin(payload) {
  const { name, email, phone, message } = payload;
  const { subject, html, text } = buildContactNotificationEmail({
    name,
    email,
    phone,
    message,
    storeName: storeName(),
  });

  return sendTransactionalMail({
    to: adminInbox(),
    subject,
    html,
    text,
    replyTo: email.trim(),
  });
}
