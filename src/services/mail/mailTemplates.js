/** @param {unknown} s */
export function escapeHtml(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatInr(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return `₹${n.toLocaleString('en-IN')}`;
}

function orderRef(order) {
  const id = order?._id?.toString?.() || String(order?._id || '');
  return id.slice(-8).toUpperCase() || id;
}

/**
 * @param {object} params
 * @param {object} params.order
 * @param {string} params.storeName
 * @param {string} [params.frontendUrl]
 */
export function buildOrderConfirmationEmail({ order, storeName, frontendUrl }) {
  const ref = orderRef(order);
  const items = order.items || [];
  const addr = order.shippingAddress || {};
  const lines = items
    .map(
      (i) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #eee;">${escapeHtml(i.name || 'Item')}</td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center;">${escapeHtml(String(i.qty ?? 1))}</td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${formatInr(i.price)}</td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${formatInr((i.price || 0) * (i.qty || 1))}</td>
    </tr>`
    )
    .join('');

  const accountUrl = frontendUrl ? `${frontendUrl.replace(/\/+$/, '')}/account?tab=orders` : null;

  const html = `
<!DOCTYPE html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <p style="font-size:14px;color:#5f8f57;font-weight:600;">${escapeHtml(storeName)}</p>
  <h1 style="font-size:22px;margin:8px 0 16px;">Thank you — your order is confirmed</h1>
  <p style="font-size:15px;color:#444;">We’ve received your payment and your order is in our system.</p>
  <table style="width:100%;margin:20px 0;font-size:14px;border-collapse:collapse;">
    <tr><td style="padding:4px 0;"><strong>Order reference</strong></td><td style="text-align:right;">#${escapeHtml(ref)}</td></tr>
    <tr><td style="padding:4px 0;"><strong>Payment</strong></td><td style="text-align:right;">Paid via Razorpay</td></tr>
    ${order.razorpayPaymentId ? `<tr><td style="padding:4px 0;"><strong>Payment ID</strong></td><td style="text-align:right;font-size:12px;word-break:break-all;">${escapeHtml(order.razorpayPaymentId)}</td></tr>` : ''}
    ${order.razorpayOrderId ? `<tr><td style="padding:4px 0;"><strong>Razorpay order</strong></td><td style="text-align:right;font-size:12px;word-break:break-all;">${escapeHtml(order.razorpayOrderId)}</td></tr>` : ''}
    <tr><td style="padding:4px 0;"><strong>Order total</strong></td><td style="text-align:right;font-weight:600;">${formatInr(order.subtotal)}</td></tr>
    <tr><td style="padding:4px 0;"><strong>Status</strong></td><td style="text-align:right;">${escapeHtml(order.status || 'Placed')}</td></tr>
  </table>
  <h2 style="font-size:16px;margin:24px 0 8px;">Items</h2>
  <table style="width:100%;font-size:14px;border-collapse:collapse;">
    <thead><tr style="text-align:left;color:#666;font-size:12px;text-transform:uppercase;">
      <th style="padding:6px 0;">Product</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Price</th><th style="text-align:right;">Line</th>
    </tr></thead>
    <tbody>${lines}</tbody>
  </table>
  <h2 style="font-size:16px;margin:24px 0 8px;">Ship to</h2>
  <p style="font-size:14px;color:#444;margin:0;">
    ${escapeHtml(addr.fullName || '')}<br/>
    ${escapeHtml(addr.line1 || '')}<br/>
    ${escapeHtml([addr.city, addr.state, addr.postalCode].filter(Boolean).join(', '))}<br/>
    ${escapeHtml(addr.country || '')}
  </p>
  ${accountUrl ? `<p style="margin-top:24px;font-size:14px;"><a href="${escapeHtml(accountUrl)}" style="color:#5f8f57;">View your orders</a></p>` : ''}
  <p style="margin-top:32px;font-size:12px;color:#888;">This is an automated message. For help, reply to our support email.</p>
</body></html>`;

  const text = [
    `${storeName} — Order confirmed`,
    `Reference: #${ref}`,
    `Total: ${formatInr(order.subtotal)}`,
    `Payment: Paid (Razorpay)`,
    order.razorpayPaymentId ? `Payment ID: ${order.razorpayPaymentId}` : '',
    `Status: ${order.status || 'Placed'}`,
    '',
    'Items:',
    ...items.map((i) => ` - ${i.name} x${i.qty} @ ${formatInr(i.price)}`),
    '',
    'Ship to:',
    [addr.fullName, addr.line1, [addr.city, addr.state, addr.postalCode].filter(Boolean).join(', '), addr.country]
      .filter(Boolean)
      .join('\n'),
  ]
    .filter(Boolean)
    .join('\n');

  return { subject: `Order confirmed — #${ref} · ${storeName}`, html, text };
}

const STATUS_COPY = {
  Placed: {
    title: 'Order received',
    body: 'We have recorded your order and will process it shortly.',
  },
  Confirmed: {
    title: 'Order confirmed',
    body: 'Your order has been confirmed by our team and will move to fulfillment.',
  },
  Packed: {
    title: 'Order packed',
    body: 'Your items have been packed and are almost ready to ship.',
  },
  Shipped: {
    title: 'Order shipped',
    body: 'Your order is on the way. You can track delivery from your account when tracking is available.',
  },
  Delivered: {
    title: 'Delivered',
    body: 'Your order has been marked as delivered. We hope you enjoy your purchase.',
  },
  Cancelled: {
    title: 'Order cancelled',
    body: 'This order has been cancelled. If you were charged, refunds follow our policy and may take a few business days.',
  },
};

/**
 * @param {object} params
 * @param {object} params.order
 * @param {string} params.previousStatus
 * @param {string} params.newStatus
 * @param {string} params.storeName
 * @param {string} [params.frontendUrl]
 */
export function buildOrderStatusEmail({ order, previousStatus, newStatus, storeName, frontendUrl }) {
  const ref = orderRef(order);
  const copy = STATUS_COPY[newStatus] || {
    title: 'Order update',
    body: `Your order status is now: ${newStatus}.`,
  };
  const awb = order.logistics?.awb;
  const accountUrl = frontendUrl ? `${frontendUrl.replace(/\/+$/, '')}/account?tab=orders` : null;

  const html = `
<!DOCTYPE html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <p style="font-size:14px;color:#5f8f57;font-weight:600;">${escapeHtml(storeName)}</p>
  <h1 style="font-size:20px;margin:8px 0 12px;">${escapeHtml(copy.title)}</h1>
  <p style="font-size:15px;color:#444;">${escapeHtml(copy.body)}</p>
  <table style="width:100%;margin:20px 0;font-size:14px;border-collapse:collapse;">
    <tr><td style="padding:4px 0;"><strong>Order</strong></td><td style="text-align:right;">#${escapeHtml(ref)}</td></tr>
    <tr><td style="padding:4px 0;"><strong>Previous status</strong></td><td style="text-align:right;">${escapeHtml(previousStatus)}</td></tr>
    <tr><td style="padding:4px 0;"><strong>Current status</strong></td><td style="text-align:right;font-weight:600;">${escapeHtml(newStatus)}</td></tr>
    ${awb ? `<tr><td style="padding:4px 0;"><strong>AWB / tracking</strong></td><td style="text-align:right;font-size:12px;word-break:break-all;">${escapeHtml(awb)}</td></tr>` : ''}
  </table>
  ${accountUrl ? `<p style="font-size:14px;"><a href="${escapeHtml(accountUrl)}" style="color:#5f8f57;">View order in your account</a></p>` : ''}
  <p style="margin-top:24px;font-size:12px;color:#888;">This is an automated message.</p>
</body></html>`;

  const text = [
    `${storeName} — ${copy.title}`,
    `Order #${ref}`,
    `Was: ${previousStatus} → Now: ${newStatus}`,
    awb ? `Tracking: ${awb}` : '',
    '',
    copy.body,
  ]
    .filter(Boolean)
    .join('\n');

  return { subject: `Order update: ${newStatus} — #${ref} · ${storeName}`, html, text };
}

/**
 * @param {object} params
 * @param {string} params.name
 * @param {string} params.email
 * @param {string} [params.phone]
 * @param {string} params.message
 * @param {string} params.storeName
 */
export function buildContactNotificationEmail({ name, email, phone, message, storeName }) {
  const html = `
<!DOCTYPE html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <h1 style="font-size:18px;">New contact form — ${escapeHtml(storeName)}</h1>
  <table style="font-size:14px;margin-top:16px;">
    <tr><td style="padding:4px 12px 4px 0;color:#666;">Name</td><td>${escapeHtml(name)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666;">Email</td><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
    ${phone ? `<tr><td style="padding:4px 12px 4px 0;color:#666;">Phone</td><td>${escapeHtml(phone)}</td></tr>` : ''}
  </table>
  <h2 style="font-size:14px;margin-top:20px;">Message</h2>
  <pre style="white-space:pre-wrap;font-size:14px;background:#f6f6f6;padding:12px;border-radius:8px;">${escapeHtml(message)}</pre>
</body></html>`;

  const text = [`Contact form — ${storeName}`, `Name: ${name}`, `Email: ${email}`, phone ? `Phone: ${phone}` : '', '', message].filter(Boolean).join('\n');

  return { subject: `Contact: ${name} — ${storeName}`, html, text };
}
