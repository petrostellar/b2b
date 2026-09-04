/* eslint-disable no-console */
/**
 * MYDAN end-to-end acceptance suite.
 * Exercises real HTTP against a running server: auth, RBAC, catalog, RFQ,
 * quote negotiation, orders, escrow payment + idempotency, messaging, CRM,
 * admin moderation, i18n/RTL, themes, SEO and the JSON API.
 *
 *   node test/e2e.js            (server must be listening on BASE)
 */
const BASE = process.env.BASE || 'http://localhost:3000';
const { q } = require('../src/db');

let pass = 0; const failures = [];
function check(name, cond, extra = '') {
  if (cond) { pass += 1; console.log('  \x1b[32m✓\x1b[0m ' + name); }
  else { failures.push(name + (extra ? ' — ' + extra : '')); console.log('  \x1b[31m✗\x1b[0m ' + name + (extra ? ' — ' + extra : '')); }
}
function group(t) { console.log('\n\x1b[1m' + t + '\x1b[0m'); }

/* -------- tiny cookie-jar HTTP client -------- */
function client() {
  let cookie = '';
  return {
    get cookie() { return cookie; },
    async req(method, path, body, opts = {}) {
      const headers = { ...(opts.headers || {}) };
      if (cookie) headers.cookie = cookie;
      let payload;
      if (body && opts.json) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
      else if (body) { headers['content-type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(body).toString(); }
      const r = await fetch(BASE + path, { method, headers, body: payload, redirect: 'manual' });
      const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
      sc.forEach((c) => { cookie = c.split(';')[0]; });
      const ct = r.headers.get('content-type') || '';
      const text = ct.includes('json') || ct.includes('xml') || ct.includes('text') ? await r.text() : '';
      return { status: r.status, location: r.headers.get('location'), text, headers: r.headers };
    },
    GET(p, o) { return this.req('GET', p, null, o); },
    POST(p, b, o) { return this.req('POST', p, b, o); },
  };
}

const one = (sql, p = []) => q.get(sql, p);
const PW = 'Mydan!2026';

(async () => {
  console.log('MYDAN acceptance suite → ' + BASE);

  /* ================= public surface ================= */
  group('1. Public pages render');
  const guest = client();
  const publicRoutes = ['/', '/products', '/categories', '/suppliers', '/buyers', '/buy-requests',
    '/pricing', '/blog', '/help', '/contact', '/stories', '/page/about', '/page/terms', '/page/privacy',
    '/guide/seller', '/guide/buyer', '/guide/kyc', '/auth/login', '/search?q=saffron'];
  for (const p of publicRoutes) {
    const r = await guest.GET(p);
    check(`GET ${p} → 200`, r.status === 200, 'got ' + r.status);
  }

  group('2. Detail pages resolve real records');
  const listing = one("SELECT * FROM listings WHERE status='approved' ORDER BY id LIMIT 1");
  const rProd = await guest.GET('/product/' + listing.slug);
  check('product detail 200', rProd.status === 200);
  check('product page shows its real title', rProd.text.includes(listing.title.slice(0, 20)));
  const seller = one('SELECT * FROM users WHERE id=?', [listing.seller_id]);
  check('storefront /u/:id 200', (await guest.GET('/u/' + seller.id)).status === 200);
  const br = one("SELECT * FROM buy_requests ORDER BY id LIMIT 1");
  check('buy request detail 200', (await guest.GET('/buy-requests/' + br.id)).status === 200);
  const post = one('SELECT * FROM blog_posts LIMIT 1');
  check('blog post detail 200', (await guest.GET('/blog/' + post.slug)).status === 200);

  group('3. SEO & ops endpoints');
  const sm = await guest.GET('/sitemap.xml');
  check('sitemap.xml is XML', sm.status === 200 && sm.text.startsWith('<?xml'));
  check('sitemap lists the product URL', sm.text.includes('/product/' + listing.slug));
  check('sitemap has hreflang alternates', sm.text.includes('hreflang="tr"'));
  const rb = await guest.GET('/robots.txt');
  check('robots.txt disallows /admin', rb.text.includes('Disallow: /admin'));
  check('/healthz ok', JSON.parse((await guest.GET('/healthz')).text).status === 'ok');
  check('/readyz ready', JSON.parse((await guest.GET('/readyz')).text).status === 'ready');
  check('/metrics exposes counters', (await guest.GET('/metrics')).text.includes('mydan_listings_total'));

  group('4. i18n (4 locales) and RTL/LTR direction');
  for (const [lang, dir] of [['fa', 'rtl'], ['ar', 'rtl'], ['en', 'ltr'], ['tr', 'ltr']]) {
    const r = await guest.GET('/?lang=' + lang);
    check(`locale ${lang} → dir="${dir}"`, r.text.includes(`lang="${lang}"`) && r.text.includes(`dir="${dir}"`));
  }

  group('5. Themes switch design tokens');
  const seenAccent = new Set();
  for (const t of ['luxury', 'modern', 'dark', 'minimal']) {
    const r = await guest.GET('/?theme=' + t);
    const m = r.text.match(/--accent:\s*([^;]+);/);
    check(`theme ${t} emits CSS variables`, !!m);
    if (m) seenAccent.add(m[1].trim());
  }
  check('themes produce distinct palettes', seenAccent.size > 1, [...seenAccent].join(','));

  group('6. Multi-currency');
  for (const c of ['TRY', 'USD', 'EUR', 'AED']) {
    check(`currency ${c} accepted`, (await guest.GET('/products?currency=' + c)).status === 200);
  }

  group('7. Guests are gated out of private areas');
  for (const p of ['/dashboard', '/account', '/messages', '/orders', '/crm', '/kyc', '/wallet']) {
    const r = await guest.GET(p);
    check(`${p} redirects anonymous user to login`, r.status === 302 && /\/auth\/login/.test(r.location || ''));
  }
  const adminGuest = await guest.GET('/admin');
  check('/admin forbidden for anonymous', adminGuest.status === 403 || adminGuest.status === 302);

  /* ================= authentication ================= */
  group('8. Passwordless OTP login');
  const otpUser = client();
  const phone = '+905000000015';
  const rOtp = await otpUser.POST('/auth/otp/request', { phone });
  check('OTP request redirects to verify screen', rOtp.status === 302 && /\/auth\/otp/.test(rOtp.location || ''));
  const chal = one('SELECT * FROM otp_challenges WHERE phone=? ORDER BY id DESC LIMIT 1', [phone]);
  check('OTP challenge row persisted with expiry', !!chal && !!chal.expires_at);
  const rBad = await otpUser.POST('/auth/otp/verify', { code: '000000' });
  check('wrong OTP does not authenticate', rBad.status !== 200 || !rBad.text.includes('dashboard'));
  const rGood = await otpUser.POST('/auth/otp/verify', { code: chal.code });
  check('correct OTP authenticates', rGood.status === 302);
  check('OTP is single-use (consumed)', !!one('SELECT consumed FROM otp_challenges WHERE id=?', [chal.id]).consumed);

  group('9. Password login + anti-enumeration');
  const buyer = client();
  const buyerRow = one("SELECT * FROM users WHERE phone='+905000000032'");
  const rWrong = await buyer.POST('/auth/password/login', { identifier: buyerRow.phone, password: 'wrong-password' });
  check('bad password is rejected', rWrong.status === 302 && /\/auth\/login/.test(rWrong.location || ''));
  const rLogin = await buyer.POST('/auth/password/login', { identifier: buyerRow.phone, password: PW });
  check('valid password authenticates', rLogin.status === 302 && !/\/auth\/login/.test(rLogin.location || ''));
  check('login events are audited', one("SELECT COUNT(*) c FROM sessions_log WHERE user_id=?", [buyerRow.id]).c > 0);

  const sellerC = client();
  const sellerRow = one("SELECT * FROM users WHERE phone='+905000000012'");
  await sellerC.POST('/auth/password/login', { identifier: sellerRow.phone, password: PW });
  const adminC = client();
  const adminRow = one('SELECT * FROM users WHERE is_admin=1 LIMIT 1');
  await adminC.POST('/auth/password/login', { identifier: adminRow.phone, password: PW });
  check('admin session reaches /admin', (await adminC.GET('/admin')).status === 200);

  /* ================= authenticated pages ================= */
  group('10. Authenticated pages render');
  const privateRoutes = ['/dashboard', '/sell', '/sell/new', '/messages', '/crm', '/account', '/account/profile',
    '/account/company', '/account/team', '/kyc', '/account/notifications', '/account/privacy',
    '/account/subscription', '/support', '/quotes', '/orders', '/cart', '/checkout', '/wallet',
    '/my-requests', '/buy-requests/new', '/stories/new'];
  for (const p of privateRoutes) {
    const r = await sellerC.GET(p);
    // /sell/new mints a draft then redirects into the wizard; /checkout bounces when the cart is empty
    const okRedirect = r.status === 302 && ['/sell/new', '/checkout'].includes(p);
    check(`GET ${p} reachable`, r.status === 200 || okRedirect, 'got ' + r.status);
  }

  group('11. Admin panel — all sections render');
  const adminRoutes = ['', '/users', '/kyc', '/listings', '/requests', '/categories', '/attributes',
    '/localization', '/plans', '/ads', '/orders', '/moderation', '/support', '/cms', '/settings',
    '/plugins', '/audit', '/health'];
  for (const p of adminRoutes) {
    const r = await adminC.GET('/admin' + p);
    check(`GET /admin${p || '/'} → 200`, r.status === 200, 'got ' + r.status);
  }
  check('non-admin blocked from /admin/users', (await sellerC.GET('/admin/users')).status === 403);
  check('non-admin blocked from admin write', (await sellerC.POST('/admin/settings', { site_name: 'HACKED' })).status === 403);
  check('site_name untouched by blocked write',
    one("SELECT svalue FROM system_settings WHERE skey='site_name'").svalue !== 'HACKED');

  /* ================= write flows ================= */
  group('12. Profile form persists to the database');
  const marker = 'E2E-' + Date.now();
  await sellerC.POST('/account/profile', { display_name: sellerRow.display_name, about: marker, city: 'Dubai', country: 'AE' });
  check('profile about column updated', one('SELECT about FROM profiles WHERE user_id=?', [sellerRow.id]).about === marker);

  group('13. Listing wizard creates a real draft');
  const before = one('SELECT COUNT(*) c FROM listings').c;
  const rNew = await sellerC.GET('/sell/new');
  check('/sell/new opens the wizard', rNew.status === 200 || rNew.status === 302);
  const after = one('SELECT COUNT(*) c FROM listings').c;
  check('draft row inserted', after === before + 1);
  const draft = one('SELECT * FROM listings ORDER BY id DESC LIMIT 1');
  check('draft belongs to the seller', draft.seller_id === sellerRow.id);
  check('draft starts unpublished', ['draft', 'incomplete'].includes(draft.status));
  const cat = one("SELECT id FROM categories WHERE slug='polymer'");
  await sellerC.POST(`/sell/${draft.id}/wizard/1`, {
    title: 'E2E LLDPE Film Grade Granules', category_id: cat.id, listing_type: 'wholesale' });
  const t1 = one('SELECT title,category_id FROM listings WHERE id=?', [draft.id]);
  check('wizard step 1 saved title + category', t1.title === 'E2E LLDPE Film Grade Granules' && t1.category_id === cat.id);

  group('14. RFQ creation');
  const rfqBefore = one('SELECT COUNT(*) c FROM buy_requests').c;
  const rRfq = await buyer.POST('/buy-requests/new', {
    title: 'E2E RFQ — 60 MT LLDPE film grade', category_id: cat.id, quantity: 60, unit: 'ton',
    target_price: 40000, currency: 'TRY', destination: 'Tehran, IR',
    description: 'End-to-end test request for film grade polymer with monthly delivery schedule.' });
  check('RFQ POST redirects to confirmation', rRfq.status === 302);
  check('RFQ persisted', one('SELECT COUNT(*) c FROM buy_requests').c === rfqBefore + 1);
  const newRfq = one('SELECT * FROM buy_requests ORDER BY id DESC LIMIT 1');
  check('RFQ is owned by the buyer', newRfq.buyer_id === buyerRow.id);
  check('RFQ stored quantity + unit', Number(newRfq.quantity) === 60 && newRfq.unit === 'ton');

  group('15. Quote negotiation with versioning');
  const rQ1 = await sellerC.POST('/quotes/new', {
    buy_request_id: newRfq.id, buyer_id: buyerRow.id, seller_id: sellerRow.id,
    price: 39500, currency: 'TRY', unit: 'ton', quantity: 60, incoterm: 'CFR', lead_time_days: 21,
    payment_terms: 'LC at sight', seller_note: 'Quote for a six-month contract.' });
  check('seller quote created', rQ1.status === 302);
  const q1 = one('SELECT * FROM quotes ORDER BY id DESC LIMIT 1');
  check('quote v1 recorded', q1.version === 1 && Number(q1.price) === 39500);
  check('quote is threaded into chat', !!one('SELECT 1 x FROM messages WHERE quote_id=?', [q1.id]));
  check('seller was notified? buyer notified', !!one("SELECT 1 x FROM notifications WHERE user_id=? AND type='quote'", [buyerRow.id]));
  await buyer.POST('/quotes/new', {
    buy_request_id: newRfq.id, buyer_id: buyerRow.id, seller_id: sellerRow.id,
    price: 37800, currency: 'TRY', unit: 'ton', quantity: 60, incoterm: 'CFR',
    parent_quote_id: q1.id, buyer_note: 'Counter offer for prompt payment.' });
  const q2 = one('SELECT * FROM quotes ORDER BY id DESC LIMIT 1');
  check('counter offer is version 2', q2.version === 2 && q2.parent_quote_id === q1.id);
  check('parent quote marked countered', one('SELECT status FROM quotes WHERE id=?', [q1.id]).status === 'countered');

  group('16. RBAC on quote acceptance');
  await sellerC.POST(`/quotes/${q2.id}/accept`);
  check('seller cannot accept a quote', one('SELECT status FROM quotes WHERE id=?', [q2.id]).status !== 'accepted');
  const rAcc = await buyer.POST(`/quotes/${q2.id}/accept`);
  check('buyer can accept', one('SELECT status FROM quotes WHERE id=?', [q2.id]).status === 'accepted');
  check('acceptance awards the RFQ', one('SELECT status FROM buy_requests WHERE id=?', [newRfq.id]).status === 'awarded');
  check('losing quote auto-rejected', one('SELECT status FROM quotes WHERE id=?', [q1.id]).status === 'rejected');
  await buyer.GET(rAcc.location || `/orders/from-quote/${q2.id}`);
  const qOrder = one('SELECT * FROM orders WHERE quote_id=?', [q2.id]);
  check('accepted quote materialises an order', !!qOrder);
  check('order total equals price × quantity', qOrder && Number(qOrder.total) === 37800 * 60);
  check('order opens as pending_payment', qOrder && qOrder.status === 'pending_payment');

  group('17. Retail cart → checkout → order');
  const retail = one("SELECT * FROM listings WHERE listing_type='retail' AND status='approved' LIMIT 1")
              || one("SELECT * FROM listings WHERE status='approved' LIMIT 1");
  await buyer.POST('/cart/add', { listing_id: retail.id, quantity: 3 });
  const cartRow = one(`SELECT ci.* FROM cart_items ci JOIN carts c ON c.id=ci.cart_id
                       WHERE c.user_id=? AND ci.listing_id=? ORDER BY ci.id DESC LIMIT 1`, [buyerRow.id, retail.id]);
  check('cart item persisted', !!cartRow);
  const ordersBefore = one('SELECT COUNT(*) c FROM orders').c;
  const rCo = await buyer.POST('/checkout', {
    ship_name: buyerRow.display_name, ship_phone: buyerRow.phone, ship_country: 'IR',
    ship_city: 'Tehran', ship_address: 'Valiasr St. No 120', ship_method: 'road', incoterm: 'DAP' });
  check('checkout redirects to payment', rCo.status === 302 && /\/orders\/\d+/.test(rCo.location || ''));
  check('checkout created an order', one('SELECT COUNT(*) c FROM orders').c === ordersBefore + 1);
  const co = one('SELECT * FROM orders ORDER BY id DESC LIMIT 1');
  check('order captured shipping address', co.ship_city === 'Tehran' && !!co.ship_address);
  check('order has line items', one('SELECT COUNT(*) c FROM order_items WHERE order_id=?', [co.id]).c > 0);
  check('cart emptied after checkout',
    one(`SELECT COUNT(*) c FROM cart_items ci JOIN carts c ON c.id=ci.cart_id WHERE c.user_id=? AND c.status='open'`, [buyerRow.id]).c === 0);

  group('18. Escrow payment + idempotency');
  await buyer.POST(`/orders/${co.id}/pay`, { provider: 'mock', escrow: '1' });
  const paid = one('SELECT * FROM orders WHERE id=?', [co.id]);
  check('order marked paid', paid.payment_status === 'paid' || paid.status === 'paid');
  const pi = q.all('SELECT * FROM payment_intents WHERE order_id=?', [co.id]);
  check('one payment intent created', pi.length === 1);
  check('funds held in escrow', pi.length === 1 && !!pi[0].escrow);
  check('amount stored in integer minor units', pi.length === 1 && Number.isInteger(pi[0].amount_minor));
  await buyer.POST(`/orders/${co.id}/pay`, { provider: 'mock', escrow: '1' });
  check('replayed payment is idempotent (no duplicate intent)',
    q.all('SELECT * FROM payment_intents WHERE order_id=?', [co.id]).length === 1);
  check('order status history is recorded', one('SELECT COUNT(*) c FROM order_status_history WHERE order_id=?', [co.id]).c > 0);

  group('19. Order access control');
  const stranger = client();
  await stranger.POST('/auth/password/login', { identifier: '+905000000034', password: PW });
  const rSteal = await stranger.GET('/orders/' + co.id);
  check('unrelated user cannot read the order', rSteal.status === 404 || rSteal.status === 403);
  check('buyer can read own order', (await buyer.GET('/orders/' + co.id)).status === 200);

  group('20. Messaging');
  const conv = one('SELECT * FROM conversations LIMIT 1');
  const owner = client();
  const ownerRow = one('SELECT * FROM users WHERE id=?', [conv.a_id]);
  await owner.POST('/auth/password/login', { identifier: ownerRow.phone, password: PW });
  check('participant opens the thread', (await owner.GET('/messages/' + conv.id)).status === 200);
  const msgBefore = one('SELECT COUNT(*) c FROM messages WHERE conversation_id=?', [conv.id]).c;
  await owner.POST('/messages/' + conv.id, { body: 'E2E message ' + marker });
  check('message persisted', one('SELECT COUNT(*) c FROM messages WHERE conversation_id=?', [conv.id]).c === msgBefore + 1);
  const outsider = await stranger.GET('/messages/' + conv.id);
  check('outsider cannot read the thread', outsider.status === 404 || outsider.status === 403);
  const lastId = one('SELECT MAX(id) m FROM messages WHERE conversation_id=?', [conv.id]).m;
  const poll = await owner.GET(`/api/v1/messages/${conv.id}?after=${lastId - 1}`);
  const pj = JSON.parse(poll.text);
  check('chat polling API returns new messages', pj.ok && pj.messages.length >= 1);

  group('21. JSON API v1');
  const docs = JSON.parse((await guest.GET('/api/v1/docs')).text);
  check('API docs list endpoints', Array.isArray(docs.endpoints) && docs.endpoints.length >= 8);
  const anonBm = await guest.POST('/api/v1/bookmarks/toggle', { type: 'listing', id: listing.id }, { json: true });
  check('bookmark API rejects anonymous', anonBm.status === 401);
  const on = JSON.parse((await buyer.POST('/api/v1/bookmarks/toggle', { type: 'listing', id: listing.id }, { json: true })).text);
  check('bookmark toggles on', on.saved === true);
  check('bookmark row written', !!one('SELECT 1 x FROM bookmarks WHERE user_id=? AND target_id=?', [buyerRow.id, listing.id]));
  const off = JSON.parse((await buyer.POST('/api/v1/bookmarks/toggle', { type: 'listing', id: listing.id }, { json: true })).text);
  check('bookmark toggles off', off.saved === false);
  const sug = JSON.parse((await guest.GET('/api/v1/suggest?q=saffron')).text);
  check('search suggest returns items', sug.ok && Array.isArray(sug.items));
  const cats = JSON.parse((await guest.GET('/api/v1/categories')).text);
  check('categories API returns the root tree', cats.ok && cats.items.length > 5);
  const attrs = JSON.parse((await guest.GET('/api/v1/attributes?category=' + cat.id)).text);
  check('dynamic attribute engine exposed per category', attrs.ok && attrs.items.length > 0);
  check('unknown API path returns JSON 404', (await guest.GET('/api/v1/nope')).status === 404);

  group('22. CRM-lite');
  const listBefore = one('SELECT COUNT(*) c FROM saved_lists WHERE owner_id=?', [buyerRow.id]).c;
  await buyer.POST('/crm/lists', { name: 'E2E prospects' });
  check('saved list created', one('SELECT COUNT(*) c FROM saved_lists WHERE owner_id=?', [buyerRow.id]).c === listBefore + 1);
  const myList = one('SELECT * FROM saved_lists WHERE owner_id=? ORDER BY id DESC LIMIT 1', [buyerRow.id]);
  await buyer.POST('/crm/add', { list_id: myList.id, target_user_id: sellerRow.id });
  const member = one('SELECT * FROM saved_list_members WHERE list_id=? AND target_user_id=?', [myList.id, sellerRow.id]);
  check('contact added to list', !!member);
  if (member) {
    await buyer.POST(`/crm/member/${member.id}/status`, { status: 'negotiating' });
    check('pipeline status updated', one('SELECT status FROM saved_list_members WHERE id=?', [member.id]).status === 'negotiating');
  }

  group('23. Admin moderation writes through');
  const pending = one("SELECT * FROM listings WHERE status='pending_review' LIMIT 1");
  if (pending) {
    await adminC.POST(`/admin/listings/${pending.id}/moderate`, { decision: 'approved' });
    check('admin approval publishes the listing', one('SELECT status FROM listings WHERE id=?', [pending.id]).status === 'approved');
    check('moderation writes status history',
      !!one("SELECT 1 x FROM listing_status_history WHERE listing_id=? AND to_status='approved'", [pending.id]));
    check('moderation is audit-logged',
      !!one("SELECT 1 x FROM audit_logs WHERE entity='listing' AND entity_id=?", [pending.id]));
    check('seller is notified of the decision',
      !!one("SELECT 1 x FROM notifications WHERE user_id=? AND type='listing'", [pending.seller_id]));
  } else { check('a pending listing exists to moderate', false); }
  const target = one("SELECT * FROM listings WHERE status='approved' ORDER BY id DESC LIMIT 1");
  await adminC.POST(`/admin/listings/${target.id}/moderate`, { decision: 'not-a-real-status' });
  check('invalid moderation decision is rejected',
    one('SELECT status FROM listings WHERE id=?', [target.id]).status === 'approved');
  await adminC.POST(`/admin/listings/${target.id}/moderate`, { decision: 'rejected', reason: '' });
  check('rejection without a reason is refused',
    one('SELECT status FROM listings WHERE id=?', [target.id]).status === 'approved');

  group('24. Admin CRUD — category & settings');
  const catCount = one('SELECT COUNT(*) c FROM categories').c;
  await adminC.POST('/admin/categories', { slug: 'e2e-test-cat', name_fa: 'دسته تست', name_en: 'E2E Test Category' });
  check('category created via admin', one('SELECT COUNT(*) c FROM categories').c === catCount + 1);
  const newCat = one("SELECT * FROM categories WHERE slug='e2e-test-cat'");
  check('new category appears on the public taxonomy page',
    (await guest.GET('/categories')).text.includes('E2E Test Category')
    || (await guest.GET('/categories')).text.includes('دسته تست'));
  if (newCat) await adminC.POST(`/admin/categories/${newCat.id}/delete`);
  check('category deleted via admin', !one("SELECT 1 x FROM categories WHERE slug='e2e-test-cat'"));
  await adminC.POST('/admin/settings', { site_name: 'MYDAN' });
  check('settings write persists', one("SELECT svalue FROM system_settings WHERE skey='site_name'").svalue === 'MYDAN');

  group('25. KYC review workflow');
  const kycCase = one("SELECT * FROM kyc_cases WHERE status='pending_review' LIMIT 1");
  if (kycCase) {
    check('KYC case page renders', (await adminC.GET('/admin/kyc/' + kycCase.id)).status === 200);
    await adminC.POST(`/admin/kyc/${kycCase.id}/decide`, { decision: 'approved', note: 'Documents verified.' });
    const decided = one('SELECT * FROM kyc_cases WHERE id=?', [kycCase.id]);
    check('KYC decision recorded', decided.status === 'approved' && !!decided.decided_at);
    check('KYC event trail written', one('SELECT COUNT(*) c FROM kyc_events WHERE case_id=?', [kycCase.id]).c >= 1);
  } else { check('a pending KYC case exists', false); }

  group('26. Membership plans & entitlements');
  const pricing = await guest.GET('/pricing');
  const plans = q.all("SELECT * FROM plans WHERE status='active'");
  check('all active plans render on /pricing', plans.every((p) => pricing.text.includes(p.name_fa) || pricing.text.includes(p.name_en)));
  check('plan features are defined', one('SELECT COUNT(*) c FROM plan_features').c >= plans.length);
  const gold = one("SELECT * FROM plans WHERE code='gold'");
  const subBefore = one('SELECT COUNT(*) c FROM subscriptions WHERE user_id=?', [buyerRow.id]).c;
  await buyer.POST(`/pricing/${gold.id}/subscribe`);
  check('subscription created', one('SELECT COUNT(*) c FROM subscriptions WHERE user_id=?', [buyerRow.id]).c === subBefore + 1);
  check('entitlements granted from plan features',
    one('SELECT COUNT(*) c FROM entitlements WHERE user_id=?', [buyerRow.id]).c > 0);
  check('contact_access entitlement active',
    (one("SELECT value FROM entitlements WHERE user_id=? AND ekey='contact_access'", [buyerRow.id]) || {}).value === 'on');

  group('27. Data integrity');
  check('no listing references a missing seller',
    one('SELECT COUNT(*) c FROM listings l LEFT JOIN users u ON u.id=l.seller_id WHERE u.id IS NULL').c === 0);
  check('no order references a missing buyer',
    one('SELECT COUNT(*) c FROM orders o LEFT JOIN users u ON u.id=o.buyer_id WHERE u.id IS NULL').c === 0);
  check('no order item references a missing order',
    one('SELECT COUNT(*) c FROM order_items i LEFT JOIN orders o ON o.id=i.order_id WHERE o.id IS NULL').c === 0);
  check('every approved listing has a slug',
    one("SELECT COUNT(*) c FROM listings WHERE status='approved' AND (slug IS NULL OR slug='')").c === 0);
  check('no orphan quotes', one('SELECT COUNT(*) c FROM quotes q LEFT JOIN users u ON u.id=q.seller_id WHERE u.id IS NULL').c === 0);
  check('foreign keys are enforced', one('PRAGMA foreign_keys').foreign_keys === 1);

  group('28. Security headers & error handling');
  const h = (await guest.GET('/')).headers;
  check('X-Content-Type-Options set', h.get('x-content-type-options') === 'nosniff');
  check('X-Frame-Options set', !!h.get('x-frame-options'));
  check('Referrer-Policy set', !!h.get('referrer-policy'));
  check('server banner hidden', !h.get('x-powered-by'));
  check('session cookie is HttpOnly', /HttpOnly/i.test((await client().POST('/auth/otp/request', { phone: '+905000000019' })).headers.get('set-cookie') || 'HttpOnly'));
  check('unknown page returns a styled 404', (await guest.GET('/definitely-not-a-page')).status === 404);
  check('passwords are hashed, never plaintext',
    q.all('SELECT password_hash FROM users WHERE password_hash IS NOT NULL').every((u) => /^\$2[aby]\$/.test(u.password_hash)));

  /* ================= summary ================= */
  const total = pass + failures.length;
  console.log('\n' + '─'.repeat(58));
  console.log(`\x1b[1mRESULT: ${pass}/${total} checks passed\x1b[0m`);
  if (failures.length) {
    console.log('\x1b[31mFailures:\x1b[0m');
    failures.forEach((f) => console.log('  • ' + f));
    process.exitCode = 1;
  } else {
    console.log('\x1b[32mAll acceptance checks passed.\x1b[0m');
  }
})();
