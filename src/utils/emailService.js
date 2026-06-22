const { BrevoClient, BrevoEnvironment } = require('@getbrevo/brevo');
const Settings = require('../models/Settings');

// ─── Brevo client setup ───────────────────────────────────────────────────────
const getClient = () => new BrevoClient({
  environment: BrevoEnvironment.Production,
  apiKey: process.env.BREVO_API_KEY,
});

// ─── Shared constants ─────────────────────────────────────────────────────────
const SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL;
const YEAR         = new Date().getFullYear();

const CURRENCY_SYMBOLS = {
  USD: '$', EUR: '€', GBP: '£', PKR: 'Rs ', INR: '₹',
  AED: 'AED ', CAD: 'C$', AUD: 'A$', JPY: '¥', CNY: '¥',
};

// Fetch brand + currency dynamically
const getBrandInfo = async () => {
  let brand = 'ShopVerse';
  let cs = '$';
  try {
    const settings = await Settings.findOne();
    if (settings && settings.siteName) brand = settings.siteName;
    if (settings && settings.currency) cs = CURRENCY_SYMBOLS[settings.currency] || settings.currency + ' ';
  } catch (e) {}
  return { brand, senderName: process.env.BREVO_SENDER_NAME || brand, cs };
};

// ─── HTML helpers ─────────────────────────────────────────────────────────────
const header = (emoji, title, brand) => `
  <div style="background:linear-gradient(135deg,#111111,#333333);padding:40px 30px;text-align:center;">
    <h1 style="color:white;margin:0;font-size:28px;">${emoji} ${title}</h1>
    <p style="color:rgba(255,255,255,0.7);margin-top:8px;font-size:14px;">${brand}</p>
  </div>`;

const footerHtml = (brand) => `
  <hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:30px 0;" />
  <p style="font-size:12px;color:#64748b;text-align:center;">&copy; ${YEAR} ${brand}. All rights reserved.</p>`;

const wrap = (content) => `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0f;border-radius:16px;overflow:hidden;">
    ${content}
  </div>`;

const body = (html, brand) =>
  `<div style="padding:40px 30px;color:#e2e8f0;">${html}${footerHtml(brand)}</div>`;

const btn = (href, text) => `
  <div style="text-align:center;margin:32px 0;">
    <a href="${href}" style="background:linear-gradient(135deg,#C9A96E,#A07840);color:white;padding:14px 40px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;display:inline-block;">${text}</a>
  </div>`;

// ─── Core send function ───────────────────────────────────────────────────────
const send = async (to, subject, htmlContent, senderName) => {
  if (!to) {
    console.log('[EmailService] No recipient email provided — skipping.');
    return;
  }
  if (!process.env.BREVO_API_KEY) {
    console.warn('[EmailService] BREVO_API_KEY not set — skipping.');
    return;
  }
  if (!SENDER_EMAIL) {
    console.warn('[EmailService] BREVO_SENDER_EMAIL not set — skipping.');
    return;
  }

  try {
    const client = getClient();
    const result = await client.transactionalEmails.sendTransacEmail({
      sender:      { name: senderName, email: SENDER_EMAIL },
      to:          [{ email: to }],
      subject,
      htmlContent,
    });
    console.log(`[EmailService] ✅ Sent to ${to} | MessageId: ${result.messageId}`);
    return result;
  } catch (err) {
    console.error('[EmailService] ❌ Brevo error:', err?.message || err);
  }
};

// ─── 1. Password Reset ────────────────────────────────────────────────────────
const sendPasswordResetEmail = async (to, resetUrl) => {
  const { brand, senderName } = await getBrandInfo();
  const html = wrap(
    header('🔐', 'Password Reset', brand) +
    body(`
      <p style="font-size:16px;line-height:1.6;">Hi there,</p>
      <p style="font-size:16px;line-height:1.6;">We received a request to reset your password. Click the button below to create a new password:</p>
      ${btn(resetUrl, 'Reset Password')}
      <p style="font-size:14px;color:#94a3b8;">This link expires in <strong>1 hour</strong>.</p>
      <p style="font-size:14px;color:#94a3b8;">If you didn't request this, you can safely ignore this email.</p>
    `, brand)
  );
  await send(to, `Password Reset - ${brand}`, html, senderName);
};

// ─── 2. Welcome / Registration ────────────────────────────────────────────────
const sendWelcomeEmail = async (to, name) => {
  const { brand, senderName } = await getBrandInfo();
  const shopUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const html = wrap(
    header('🎉', `Welcome to ${brand}!`, brand) +
    body(`
      <p style="font-size:16px;line-height:1.6;">Hi <strong>${name}</strong>,</p>
      <p style="font-size:16px;line-height:1.6;">Thanks for creating your account! You're all set to start shopping the best deals.</p>
      ${btn(shopUrl + '/products', 'Start Shopping')}
      <p style="font-size:14px;color:#94a3b8;">Here's what you can do:</p>
      <ul style="font-size:14px;color:#94a3b8;padding-left:20px;line-height:2;">
        <li>Browse our premium collection</li>
        <li>Add items to your wishlist</li>
        <li>Track your orders in real-time</li>
        <li>Get exclusive deals &amp; discounts</li>
      </ul>
    `, brand)
  );
  await send(to, `Welcome to ${brand}! 🎉`, html, senderName);
};

// ─── 3. Order Confirmation ────────────────────────────────────────────────────
const sendOrderConfirmationEmail = async (to, order) => {
  const { brand, senderName, cs } = await getBrandInfo();
  const shopUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  const itemRows = (order.items || []).map(item => `
    <tr>
      <td style="padding:12px 8px;border-bottom:1px solid rgba(255,255,255,0.06);color:#e2e8f0;font-size:14px;">${item.name || item.product?.name || 'Product'}</td>
      <td style="padding:12px 8px;border-bottom:1px solid rgba(255,255,255,0.06);color:#94a3b8;font-size:14px;text-align:center;">x${item.quantity}</td>
      <td style="padding:12px 8px;border-bottom:1px solid rgba(255,255,255,0.06);color:#e2e8f0;font-size:14px;text-align:right;">${cs}${(item.price * item.quantity).toFixed(2)}</td>
    </tr>`).join('');

  const html = wrap(
    header('✅', 'Order Confirmed!', brand) +
    body(`
      <p style="font-size:16px;line-height:1.6;">Hi <strong>${order.shippingAddress?.fullName || 'there'}</strong>,</p>
      <p style="font-size:16px;line-height:1.6;">Your order has been placed successfully!</p>

      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;margin:24px 0;">
        <p style="margin:0 0 4px;font-size:13px;color:#64748b;">Order Number</p>
        <p style="margin:0;font-size:20px;font-weight:bold;color:#C9A96E;">${order.orderNumber}</p>
      </div>

      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <thead>
          <tr>
            <th style="text-align:left;padding:8px;color:#64748b;font-size:12px;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.1);">Item</th>
            <th style="text-align:center;padding:8px;color:#64748b;font-size:12px;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.1);">Qty</th>
            <th style="text-align:right;padding:8px;color:#64748b;font-size:12px;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.1);">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <div style="text-align:right;margin:16px 0;">
        ${order.shippingCost ? `<p style="font-size:14px;color:#94a3b8;margin:4px 0;">Shipping: ${cs}${order.shippingCost.toFixed(2)}</p>` : ''}
        ${order.discount   ? `<p style="font-size:14px;color:#22c55e;margin:4px 0;">Discount: -${cs}${order.discount.toFixed(2)}</p>` : ''}
        <p style="font-size:18px;color:white;font-weight:bold;margin:8px 0;">Total: ${cs}${(order.total || 0).toFixed(2)}</p>
      </div>

      <p style="font-size:14px;color:#94a3b8;">Payment: <strong>${order.paymentMethod || 'Cash on Delivery'}</strong></p>
      ${btn(shopUrl + '/track-order', 'Track Your Order')}
    `, brand)
  );
  await send(to, `Order Confirmed #${order.orderNumber} - ${brand}`, html, senderName);
};

// ─── 4. Order Status Update ───────────────────────────────────────────────────
const sendOrderStatusEmail = async (to, order, newStatus) => {
  const { brand, senderName } = await getBrandInfo();
  const shopUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  const statusConfig = {
    processing: { emoji: '🔄', title: 'Order Processing',  msg: "We're preparing your order. It will be shipped soon!" },
    shipped:    { emoji: '🚚', title: 'Order Shipped!',    msg: 'Your order is on its way! Track its progress below.' },
    delivered:  { emoji: '📦', title: 'Order Delivered!',  msg: 'Your order has been delivered. We hope you love it!' },
    cancelled:  { emoji: '❌', title: 'Order Cancelled',   msg: "Your order has been cancelled. Contact support if needed." },
  };

  const config = statusConfig[newStatus] || {
    emoji: '📋', title: `Order ${newStatus}`,
    msg: `Your order status has been updated to: ${newStatus}.`,
  };

  const html = wrap(
    header(config.emoji, config.title, brand) +
    body(`
      <p style="font-size:16px;line-height:1.6;">Hi <strong>${order.shippingAddress?.fullName || 'there'}</strong>,</p>
      <p style="font-size:16px;line-height:1.6;">${config.msg}</p>

      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;margin:24px 0;">
        <p style="margin:0 0 4px;font-size:13px;color:#64748b;">Order Number</p>
        <p style="margin:0 0 12px;font-size:20px;font-weight:bold;color:#C9A96E;">${order.orderNumber}</p>
        <p style="margin:0 0 4px;font-size:13px;color:#64748b;">Status</p>
        <p style="margin:0;font-size:16px;font-weight:bold;color:#22c55e;text-transform:capitalize;">${newStatus}</p>
      </div>

      ${order.trackingId ? `<p style="font-size:14px;color:#94a3b8;">Tracking Number: <strong>${order.trackingId}</strong></p>` : ''}
      ${btn(shopUrl + '/track-order', 'View Order Details')}
    `, brand)
  );
  await send(to, `${config.title} #${order.orderNumber} - ${brand}`, html, senderName);
};

// ─── 5. Low Stock Alert (Admin) ───────────────────────────────────────────────
const sendLowStockAlertEmail = async (to, product) => {
  const { brand, senderName } = await getBrandInfo();
  const html = wrap(
    header('⚠️', 'Low Stock Alert', brand) +
    body(`
      <p style="font-size:16px;line-height:1.6;">Hello Admin,</p>
      <p style="font-size:16px;line-height:1.6;">The following product is running low on stock:</p>

      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;margin:24px 0;">
        <p style="margin:0 0 4px;font-size:13px;color:#64748b;">Product Name</p>
        <p style="margin:0 0 12px;font-size:20px;font-weight:bold;color:#C9A96E;">${product.name}</p>
        <p style="margin:0 0 4px;font-size:13px;color:#64748b;">Current Stock</p>
        <p style="margin:0 0 12px;font-size:16px;font-weight:bold;color:#eab308;">${product.stock}</p>
        <p style="margin:0 0 4px;font-size:13px;color:#64748b;">Low Stock Threshold</p>
        <p style="margin:0;font-size:16px;font-weight:bold;color:#e2e8f0;">${product.lowStockAlert || 5}</p>
      </div>

      <p style="font-size:14px;color:#94a3b8;">Please restock as soon as possible.</p>
    `, brand)
  );
  await send(to, `Low Stock Alert: ${product.name} - ${brand}`, html, senderName);
};

// ─── 6. New Order Notification (Admin) ────────────────────────────────────────
const sendNewOrderAdminNotification = async (to, order) => {
  const { brand, senderName, cs } = await getBrandInfo();
  
  const itemRows = (order.items || []).map(item => `
    <tr>
      <td style="padding:12px 8px;border-bottom:1px solid rgba(255,255,255,0.06);color:#e2e8f0;font-size:14px;">${item.name || item.product?.name || 'Product'}</td>
      <td style="padding:12px 8px;border-bottom:1px solid rgba(255,255,255,0.06);color:#94a3b8;font-size:14px;text-align:center;">x${item.quantity}</td>
      <td style="padding:12px 8px;border-bottom:1px solid rgba(255,255,255,0.06);color:#e2e8f0;font-size:14px;text-align:right;">${cs}${(item.price * item.quantity).toFixed(2)}</td>
    </tr>`).join('');

  const html = wrap(
    header('🛍️', 'New Order Received', brand) +
    body(`
      <p style="font-size:16px;line-height:1.6;">Hello Admin,</p>
      <p style="font-size:16px;line-height:1.6;">A new order has been placed on your store.</p>

      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;margin:24px 0;">
        <p style="margin:0 0 4px;font-size:13px;color:#64748b;">Order Number</p>
        <p style="margin:0 0 12px;font-size:20px;font-weight:bold;color:#C9A96E;">${order.orderNumber}</p>
        <p style="margin:0 0 4px;font-size:13px;color:#64748b;">Customer</p>
        <p style="margin:0;font-size:16px;font-weight:bold;color:#e2e8f0;">${order.shippingAddress?.fullName || 'Guest'} (${order.shippingAddress?.email || 'No email'})</p>
        <p style="margin:4px 0 0;font-size:14px;color:#94a3b8;">Phone: ${order.shippingAddress?.phone || 'N/A'}</p>
        <p style="margin:4px 0 0;font-size:14px;color:#94a3b8;">Address: ${order.shippingAddress?.address1 || ''}${order.shippingAddress?.address2 ? `, ${order.shippingAddress.address2}` : ''}, ${order.shippingAddress?.city || ''}, ${order.shippingAddress?.state || ''} ${order.shippingAddress?.zip || ''}, ${order.shippingAddress?.country || ''}</p>
      </div>

      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <thead>
          <tr>
            <th style="text-align:left;padding:8px;color:#64748b;font-size:12px;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.1);">Item</th>
            <th style="text-align:center;padding:8px;color:#64748b;font-size:12px;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.1);">Qty</th>
            <th style="text-align:right;padding:8px;color:#64748b;font-size:12px;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.1);">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <div style="text-align:right;margin:16px 0;">
        <p style="font-size:18px;color:white;font-weight:bold;margin:8px 0;">Total: ${cs}${(order.total || 0).toFixed(2)}</p>
      </div>

      <p style="font-size:14px;color:#94a3b8;">Payment: <strong>${order.paymentMethod || 'Cash on Delivery'}</strong></p>
    `, brand)
  );
  await send(to, `New Order #${order.orderNumber} - ${brand}`, html, senderName);
};

// ─── 7. Tracking Email ────────────────────────────────────────────────────────
const sendTrackingEmail = async ({ to, orderNumber, customerName, trackingId, trackingUrl, courierName }) => {
  const { brand, senderName } = await getBrandInfo();
  const html = wrap(
    header('🚚', 'Order Shipped!', brand) +
    body(`
      <p style="font-size:16px;line-height:1.6;">Hi <strong>${customerName || 'there'}</strong>,</p>
      <p style="font-size:16px;line-height:1.6;">Your order <strong>${orderNumber}</strong> has been handed over to <strong>${courierName}</strong> and is on its way to you.</p>

      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px;margin:24px 0;">
        <p style="margin:0 0 4px;font-size:13px;color:#64748b;">Tracking ID</p>
        <p style="margin:0;font-size:22px;font-weight:bold;color:#C9A96E;font-family:'Courier New',monospace;letter-spacing:0.04em;">${trackingId}</p>
        <p style="margin:8px 0 0;font-size:13px;color:#94a3b8;">via ${courierName}</p>
      </div>

      ${trackingUrl ? btn(trackingUrl, 'Track My Order →') : ''}
    `, brand)
  );
  await send(to, `Order Shipped #${orderNumber} - ${brand}`, html, senderName);
};

module.exports = {
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendOrderConfirmationEmail,
  sendOrderStatusEmail,
  sendLowStockAlertEmail,
  sendNewOrderAdminNotification,
  sendTrackingEmail,
};
