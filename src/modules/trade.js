/** Quotes, negotiation, cart, orders, payments, shipments, disputes. */
const express = require('express');
const { q } = require('../db');
const H = require('../lib/helpers');
const { flash, requireAuth } = require('../middleware/context');
const { findOrCreate } = require('./messaging');

const r = express.Router();

/* ================= QUOTES ================= */
r.get('/quotes', requireAuth, (req, res) => {
  const uid = req.user.id;
  const role = req.query.role === 'buyer' ? 'buyer' : 'seller';
  res.render('commerce/quotes', {
    title: 'پیش‌فاکتورها', role,
    rows: q.all(`SELECT qt.*, b.title rfq_title, l.title listing_title,
        su.display_name seller_name, bu.display_name buyer_name
      FROM quotes qt LEFT JOIN buy_requests b ON b.id=qt.buy_request_id
      LEFT JOIN listings l ON l.id=qt.listing_id
      JOIN users su ON su.id=qt.seller_id JOIN users bu ON bu.id=qt.buyer_id
      WHERE qt.${role}_id=? ORDER BY qt.id DESC`, [uid]),
  });
});

r.get('/quotes/new', requireAuth, (req, res) => {
  const rfq = req.query.rfq ? q.get('SELECT * FROM buy_requests WHERE id=?', [req.query.rfq]) : null;
  const listing = req.query.listing ? q.get('SELECT * FROM listings WHERE id=?', [req.query.listing]) : null;
  let buyerId = null, sellerId = null;
  if (rfq) { buyerId = rfq.buyer_id; sellerId = req.user.id; }
  else if (listing) { sellerId = listing.seller_id; buyerId = req.user.id; }
  else if (req.query.to) { sellerId = req.user.id; buyerId = +req.query.to; }
  if (!buyerId || !sellerId) return res.redirect('/quotes');
  res.render('commerce/quote-new', {
    title: 'ارسال پیش‌فاکتور', rfq, listing, buyerId, sellerId,
    isSeller: sellerId === req.user.id,
    sample: req.query.sample === '1',
    currencies: q.all('SELECT * FROM currencies WHERE enabled=1'),
    parent: req.query.counter ? q.get('SELECT * FROM quotes WHERE id=?', [req.query.counter]) : null,
  });
});

r.post('/quotes/new', requireAuth, (req, res) => {
  const b = req.body;
  const buyerId = +b.buyer_id, sellerId = +b.seller_id;
  if (![buyerId, sellerId].includes(req.user.id)) return res.sendStatus(403);
  if (!b.price || +b.price <= 0) { flash(req, 'err', 'قیمت الزامی است'); return res.redirect(req.get('referer') || '/quotes'); }
  const parent = b.parent_quote_id ? q.get('SELECT * FROM quotes WHERE id=?', [b.parent_quote_id]) : null;
  const info = q.run(`INSERT INTO quotes (buy_request_id,listing_id,seller_id,buyer_id,price,currency,unit,quantity,moq,
      tax,shipping,incoterm,lead_time_days,valid_until,payment_terms,seller_note,buyer_note,version,parent_quote_id,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'sent')`,
    [b.buy_request_id || null, b.listing_id || null, sellerId, buyerId, +b.price, b.currency || req.currency,
     b.unit || null, +b.quantity || null, +b.moq || null, +b.tax || 0, +b.shipping || 0, b.incoterm || null,
     +b.lead_time_days || null, b.valid_until || null, b.payment_terms || null,
     b.seller_note || null, b.buyer_note || null, parent ? parent.version + 1 : 1, parent ? parent.id : null]);
  if (parent) q.run(`UPDATE quotes SET status='countered' WHERE id=?`, [parent.id]);
  if (b.buy_request_id) q.run(`UPDATE buy_requests SET status='negotiating' WHERE id=? AND status='approved'`, [b.buy_request_id]);

  const peer = req.user.id === sellerId ? buyerId : sellerId;
  H.notify(peer, { type: 'quote', title: 'پیش‌فاکتور جدید', body: `مبلغ ${b.price} ${b.currency}`, link: '/quotes/' + info.lastInsertRowid });
  // link into chat thread
  const conv = findOrCreate(sellerId, buyerId, b.buy_request_id ? 'buy_request' : (b.listing_id ? 'listing' : null),
    b.buy_request_id ? +b.buy_request_id : (b.listing_id ? +b.listing_id : null));
  q.run('INSERT INTO messages (conversation_id,sender_id,body,quote_id) VALUES (?,?,?,?)',
    [conv.id, req.user.id, `📄 پیش‌فاکتور ارسال شد: ${b.price} ${b.currency}`, info.lastInsertRowid]);
  q.run(`UPDATE conversations SET last_message=?, last_message_at=datetime('now') WHERE id=?`, ['📄 پیش‌فاکتور', conv.id]);
  H.track('quote_sent', { actor_id: req.user.id, target_type: 'quote', target_id: info.lastInsertRowid, req });
  flash(req, 'ok', 'پیش‌فاکتور ارسال شد ✓');
  res.redirect('/quotes/' + info.lastInsertRowid);
});

r.get('/quotes/:id', requireAuth, (req, res) => {
  const qt = q.get(`SELECT qt.*, su.display_name seller_name, bu.display_name buyer_name,
      b.title rfq_title, l.title listing_title, l.slug listing_slug
    FROM quotes qt JOIN users su ON su.id=qt.seller_id JOIN users bu ON bu.id=qt.buyer_id
    LEFT JOIN buy_requests b ON b.id=qt.buy_request_id LEFT JOIN listings l ON l.id=qt.listing_id
    WHERE qt.id=?`, [req.params.id]);
  if (!qt || ![qt.seller_id, qt.buyer_id].includes(req.user.id)) return res.status(404).render('errors/404');
  res.render('commerce/quote', {
    title: 'پیش‌فاکتور #' + qt.id, qt,
    isBuyer: req.user.id === qt.buyer_id,
    history: q.all(`WITH RECURSIVE chain(id) AS (
        SELECT ? UNION SELECT q2.id FROM quotes q2 JOIN chain ON q2.parent_quote_id=chain.id)
      SELECT * FROM quotes WHERE id IN (SELECT id FROM chain) OR id IN (
        SELECT parent_quote_id FROM quotes WHERE id=?) ORDER BY version`, [qt.id, qt.id]),
  });
});

r.post('/quotes/:id/:action', requireAuth, (req, res) => {
  const qt = q.get('SELECT * FROM quotes WHERE id=?', [req.params.id]);
  if (!qt || ![qt.seller_id, qt.buyer_id].includes(req.user.id)) return res.sendStatus(403);
  const a = req.params.action;
  if (!['accept', 'reject'].includes(a)) return res.sendStatus(404);
  if (req.user.id !== qt.buyer_id) { flash(req, 'err', 'تنها خریدار می‌تواند پیش‌فاکتور را بپذیرد یا رد کند.'); return res.redirect('/quotes/' + qt.id); }
  if (!['sent', 'countered'].includes(qt.status)) { flash(req, 'err', 'وضعیت این پیش‌فاکتور قابل تغییر نیست.'); return res.redirect('/quotes/' + qt.id); }
  if (a === 'accept') {
    q.run(`UPDATE quotes SET status='accepted' WHERE id=?`, [qt.id]);
    if (qt.buy_request_id) {
      q.run(`UPDATE buy_requests SET status='awarded', awarded_seller_id=? WHERE id=?`, [qt.seller_id, qt.buy_request_id]);
      q.run(`UPDATE quotes SET status='rejected' WHERE buy_request_id=? AND id!=? AND status IN ('sent','countered')`, [qt.buy_request_id, qt.id]);
    }
    H.notify(qt.seller_id, { type: 'quote', title: 'پیش‌فاکتور پذیرفته شد', body: '#' + qt.id, link: '/quotes/' + qt.id });
    return res.redirect('/orders/from-quote/' + qt.id);
  }
  if (a === 'reject') q.run(`UPDATE quotes SET status='rejected' WHERE id=?`, [qt.id]);
  flash(req, 'ok', 'انجام شد');
  res.redirect('/quotes/' + qt.id);
});

/* ================= CART (retail) ================= */
function getCart(uid) {
  let c = q.get(`SELECT * FROM carts WHERE user_id=? AND status='open'`, [uid]);
  if (!c) { const i = q.run('INSERT INTO carts (user_id) VALUES (?)', [uid]); c = q.get('SELECT * FROM carts WHERE id=?', [i.lastInsertRowid]); }
  return c;
}
r.get('/cart', requireAuth, (req, res) => {
  const c = getCart(req.user.id);
  const items = q.all(`SELECT ci.*, l.title, l.slug, l.currency lcur, l.seller_id,
      (SELECT path FROM listing_media WHERE listing_id=l.id LIMIT 1) cover
    FROM cart_items ci JOIN listings l ON l.id=ci.listing_id WHERE ci.cart_id=?`, [c.id]);
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  res.render('commerce/cart', { title: 'سبد خرید', items, subtotal, tax: subtotal * 0.18, total: subtotal * 1.18 });
});
r.post('/cart/add', requireAuth, (req, res) => {
  const l = q.get('SELECT * FROM listings WHERE id=?', [req.body.listing_id]);
  if (!l) return res.sendStatus(404);
  const c = getCart(req.user.id);
  q.run(`INSERT INTO cart_items (cart_id,listing_id,quantity,unit_price,currency) VALUES (?,?,?,?,?)
         ON CONFLICT(cart_id,listing_id) DO UPDATE SET quantity=quantity+excluded.quantity`,
    [c.id, l.id, +req.body.quantity || 1, l.retail_price || l.price || 0, l.currency]);
  flash(req, 'ok', 'به سبد افزوده شد ✓');
  res.redirect('/cart');
});
r.post('/cart/remove/:id', requireAuth, (req, res) => {
  q.run('DELETE FROM cart_items WHERE id=?', [req.params.id]); res.redirect('/cart');
});

/* ================= CHECKOUT / ORDERS ================= */
r.get('/checkout', requireAuth, (req, res) => {
  const c = getCart(req.user.id);
  const items = q.all(`SELECT ci.*, l.title, l.seller_id FROM cart_items ci JOIN listings l ON l.id=ci.listing_id WHERE ci.cart_id=?`, [c.id]);
  if (!items.length) return res.redirect('/cart');
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  res.render('commerce/checkout', { title: 'تسویه حساب', items, subtotal, tax: subtotal * 0.18, shipping: 0, total: subtotal * 1.18,
    countries: q.all('SELECT * FROM countries WHERE enabled=1') });
});

r.post('/checkout', requireAuth, (req, res) => {
  const c = getCart(req.user.id);
  const items = q.all(`SELECT ci.*, l.title, l.seller_id FROM cart_items ci JOIN listings l ON l.id=ci.listing_id WHERE ci.cart_id=?`, [c.id]);
  if (!items.length) return res.redirect('/cart');
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const tax = subtotal * 0.18, total = subtotal + tax;
  const orderNo = 'MD-' + Date.now().toString(36).toUpperCase();
  const info = q.run(`INSERT INTO orders (order_no,buyer_id,seller_id,subtotal,tax,total,currency,ship_name,ship_phone,
      ship_country,ship_city,ship_address,ship_method,po_reference,incoterm,status,payment_status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending_payment','unpaid')`,
    [orderNo, req.user.id, items[0].seller_id, subtotal, tax, total, items[0].currency || req.currency,
     req.body.ship_name, req.body.ship_phone, req.body.ship_country, req.body.ship_city,
     req.body.ship_address, req.body.ship_method || 'courier', req.body.po_reference || null, req.body.incoterm || null]);
  items.forEach((i) => q.run('INSERT INTO order_items (order_id,listing_id,title,quantity,unit_price,line_total,currency) VALUES (?,?,?,?,?,?,?)',
    [info.lastInsertRowid, i.listing_id, i.title, i.quantity, i.unit_price, i.quantity * i.unit_price, i.currency]));
  q.run(`UPDATE carts SET status='converted' WHERE id=?`, [c.id]);
  q.run('INSERT INTO order_status_history (order_id,from_status,to_status,actor_id) VALUES (?,?,?,?)',
    [info.lastInsertRowid, null, 'pending_payment', req.user.id]);
  res.redirect('/orders/' + info.lastInsertRowid + '/pay');
});

r.get('/orders/from-quote/:id', requireAuth, (req, res) => {
  const qt = q.get('SELECT * FROM quotes WHERE id=?', [req.params.id]);
  if (!qt || ![qt.seller_id, qt.buyer_id].includes(req.user.id)) return res.sendStatus(403);
  let o = q.get('SELECT * FROM orders WHERE quote_id=?', [qt.id]);
  if (!o && qt.status !== 'accepted') {
    flash(req, 'err', 'تا زمانی که خریدار پیش‌فاکتور را نپذیرفته، سفارش ایجاد نمی‌شود.');
    return res.redirect('/quotes/' + qt.id);
  }
  if (!o) {
    const subtotal = (qt.price || 0) * (qt.quantity || 1);
    const total = subtotal + (qt.tax || 0) + (qt.shipping || 0);
    const info = q.run(`INSERT INTO orders (order_no,buyer_id,seller_id,quote_id,subtotal,tax,shipping,total,currency,incoterm,status,payment_status)
      VALUES (?,?,?,?,?,?,?,?,?,?,'pending_payment','unpaid')`,
      ['MD-' + Date.now().toString(36).toUpperCase(), qt.buyer_id, qt.seller_id, qt.id, subtotal, qt.tax || 0, qt.shipping || 0, total, qt.currency, qt.incoterm]);
    q.run('INSERT INTO order_items (order_id,listing_id,title,quantity,unit_price,line_total,currency) VALUES (?,?,?,?,?,?,?)',
      [info.lastInsertRowid, qt.listing_id, (qt.listing_id ? (q.get('SELECT title FROM listings WHERE id=?', [qt.listing_id]) || {}).title : null) || ((qt.buy_request_id ? (q.get('SELECT title FROM buy_requests WHERE id=?', [qt.buy_request_id]) || {}).title : null) || ('پیش‌فاکتور #' + qt.id)), qt.quantity || 1, qt.price, subtotal, qt.currency]);
    o = q.get('SELECT * FROM orders WHERE id=?', [info.lastInsertRowid]);
  }
  res.redirect('/orders/' + o.id);
});

r.get('/orders', requireAuth, (req, res) => {
  const role = req.query.role === 'seller' ? 'seller' : 'buyer';
  res.render('commerce/orders', { title: 'سفارش‌ها', role,
    rows: q.all(`SELECT o.*, bu.display_name buyer_name, su.display_name seller_name
      FROM orders o JOIN users bu ON bu.id=o.buyer_id LEFT JOIN users su ON su.id=o.seller_id
      WHERE o.${role}_id=? ORDER BY o.id DESC`, [req.user.id]) });
});

r.get('/orders/:id', requireAuth, (req, res) => {
  const o = q.get(`SELECT o.*, bu.display_name buyer_name, su.display_name seller_name FROM orders o
    JOIN users bu ON bu.id=o.buyer_id LEFT JOIN users su ON su.id=o.seller_id WHERE o.id=?`, [req.params.id]);
  if (!o || (![o.buyer_id, o.seller_id].includes(req.user.id) && !req.user.is_admin)) return res.status(404).render('errors/404');
  res.render('commerce/order', { title: 'سفارش ' + o.order_no, o,
    isSeller: req.user.id === o.seller_id,
    isBuyer: req.user.id === o.buyer_id,
    canPay: req.user.id === o.buyer_id && !['released', 'paid'].includes(o.payment_status) && o.status !== 'cancelled',
    items: q.all('SELECT * FROM order_items WHERE order_id=?', [o.id]),
    history: q.all('SELECT * FROM order_status_history WHERE order_id=? ORDER BY id', [o.id]),
    shipments: q.all('SELECT * FROM shipments WHERE order_id=?', [o.id]),
    payment: q.get('SELECT * FROM payment_intents WHERE order_id=? ORDER BY id DESC LIMIT 1', [o.id]),
    dispute: q.get('SELECT * FROM disputes WHERE order_id=?', [o.id]) });
});

r.get('/orders/:id/pay', requireAuth, (req, res) => {
  const o = q.get('SELECT * FROM orders WHERE id=?', [req.params.id]);
  if (!o || ![o.buyer_id, o.seller_id].includes(req.user.id)) return res.status(404).render('errors/404');
  if (o.buyer_id !== req.user.id) { flash(req, 'err', 'تنها خریدار می‌تواند پرداخت را انجام دهد.'); return res.redirect('/orders/' + o.id); }
  if (['paid', 'released'].includes(o.payment_status)) { flash(req, 'ok', 'این سفارش قبلاً پرداخت شده است.'); return res.redirect('/orders/' + o.id); }
  res.render('commerce/pay', { title: 'پرداخت', o,
    wallet: q.get('SELECT * FROM wallets WHERE user_id=?', [req.user.id]) });
});

/* Payment with idempotency key — money handled as integer minor units only. */
r.post('/orders/:id/pay', requireAuth, (req, res) => {
  const o = q.get('SELECT * FROM orders WHERE id=? AND buyer_id=?', [req.params.id, req.user.id]);
  if (!o) return res.sendStatus(404);
  const key = `order-${o.id}-${req.body.provider || 'mock'}`;
  const existing = q.get('SELECT * FROM payment_intents WHERE idempotency_key=?', [key]);
  if (existing && existing.status === 'succeeded') return res.redirect('/orders/' + o.id);

  const amountMinor = Math.round(o.total * 100);
  const escrow = req.body.escrow ? 1 : 0;
  if (!existing) q.run(`INSERT INTO payment_intents (idempotency_key,order_id,payer_id,payee_id,amount_minor,currency,provider,status,escrow)
    VALUES (?,?,?,?,?,?,?,'processing',?)`, [key, o.id, o.buyer_id, o.seller_id, amountMinor, o.currency, req.body.provider || 'mock', escrow]);

  // Mock provider settlement (swap for real gateway adapter)
  q.run(`UPDATE payment_intents SET status='succeeded', provider_ref=?, updated_at=datetime('now') WHERE idempotency_key=?`,
    ['MOCK-' + Date.now(), key]);
  q.run(`UPDATE orders SET payment_status='paid', status='paid', updated_at=datetime('now') WHERE id=?`, [o.id]);
  q.run('INSERT INTO order_status_history (order_id,from_status,to_status,actor_id,note) VALUES (?,?,?,?,?)',
    [o.id, o.status, 'paid', req.user.id, escrow ? 'وجه در حساب امانی نگهداری می‌شود' : null]);

  if (!escrow && o.seller_id) {
    const w = q.get('SELECT * FROM wallets WHERE user_id=?', [o.seller_id]);
    if (w) {
      const nb = w.balance_minor + amountMinor;
      q.run('UPDATE wallets SET balance_minor=? WHERE id=?', [nb, w.id]);
      q.run('INSERT INTO wallet_entries (wallet_id,direction,amount_minor,currency,reason,ref_type,ref_id,balance_after_minor) VALUES (?,?,?,?,?,?,?,?)',
        [w.id, 'credit', amountMinor, o.currency, 'order_payment', 'order', o.id, nb]);
    }
  }
  H.notify(o.seller_id, { type: 'payment', title: 'پرداخت دریافت شد', body: o.order_no, link: '/orders/' + o.id });
  H.track('order_paid', { actor_id: req.user.id, target_type: 'order', target_id: o.id, req });
  flash(req, 'ok', 'پرداخت با موفقیت انجام شد ✓');
  res.redirect('/orders/' + o.id);
});

r.post('/orders/:id/status', requireAuth, (req, res) => {
  const o = q.get('SELECT * FROM orders WHERE id=?', [req.params.id]);
  if (!o || (![o.buyer_id, o.seller_id].includes(req.user.id) && !req.user.is_admin)) return res.sendStatus(403);
  const to = req.body.status;
  const allowed = ['confirmed', 'processing', 'ready_to_ship', 'shipped', 'delivered', 'completed', 'cancelled'];
  if (!allowed.includes(to)) return res.sendStatus(400);
  q.run(`UPDATE orders SET status=?, updated_at=datetime('now') WHERE id=?`, [to, o.id]);
  q.run('INSERT INTO order_status_history (order_id,from_status,to_status,actor_id,note) VALUES (?,?,?,?,?)',
    [o.id, o.status, to, req.user.id, req.body.note || null]);
  if (to === 'shipped') q.run('INSERT INTO shipments (order_id,carrier,method,tracking_no,origin,destination,status) VALUES (?,?,?,?,?,?,?)',
    [o.id, req.body.carrier || 'Carrier', req.body.method || 'cargo', req.body.tracking_no || null, req.body.origin || null, o.ship_city, 'in_transit']);
  H.notify(o.buyer_id === req.user.id ? o.seller_id : o.buyer_id,
    { type: 'order', title: 'وضعیت سفارش تغییر کرد', body: `${o.order_no} → ${to}`, link: '/orders/' + o.id });
  flash(req, 'ok', 'وضعیت به‌روزرسانی شد');
  res.redirect('/orders/' + o.id);
});

r.post('/orders/:id/dispute', requireAuth, (req, res) => {
  const o = q.get('SELECT * FROM orders WHERE id=?', [req.params.id]);
  if (!o || ![o.buyer_id, o.seller_id].includes(req.user.id)) return res.sendStatus(403);
  q.run('INSERT INTO disputes (order_id,opener_id,claim,evidence) VALUES (?,?,?,?)',
    [o.id, req.user.id, req.body.claim, req.body.evidence || null]);
  q.run(`UPDATE orders SET status='disputed' WHERE id=?`, [o.id]);
  flash(req, 'ok', 'اختلاف ثبت شد و تیم داوری بررسی می‌کند.');
  res.redirect('/orders/' + o.id);
});

/* ================= WALLET ================= */
r.get('/wallet', requireAuth, (req, res) => {
  let w = q.get('SELECT * FROM wallets WHERE user_id=?', [req.user.id]);
  if (!w) { q.run('INSERT INTO wallets (user_id,currency) VALUES (?,?)', [req.user.id, req.currency]); w = q.get('SELECT * FROM wallets WHERE user_id=?', [req.user.id]); }
  res.render('commerce/wallet', { title: 'کیف پول', w,
    entries: q.all('SELECT * FROM wallet_entries WHERE wallet_id=? ORDER BY id DESC LIMIT 50', [w.id]) });
});

module.exports = r;
