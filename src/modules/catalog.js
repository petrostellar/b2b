const express = require('express');
const { q } = require('../db');
const H = require('../lib/helpers');
const { flash } = require('../middleware/context');

const r = express.Router();

const LISTING_SELECT = `
  SELECT l.*, u.display_name AS seller_name, u.avatar AS seller_avatar, u.trust_score,
         p.business_name, p.country AS seller_country, p.city AS seller_city, p.seller_type,
         c.slug AS cat_slug, c.name_fa AS cat_name_fa, c.name_en AS cat_name_en,
         c.name_tr AS cat_name_tr, c.name_ar AS cat_name_ar,
         (SELECT path FROM listing_media WHERE listing_id=l.id ORDER BY sort_order, id LIMIT 1) AS cover,
         (SELECT COUNT(*) FROM kyc_cases k WHERE k.user_id=u.id AND k.status='approved') AS kyc_ok,
         (SELECT ROUND(AVG(score),1) FROM reviews WHERE target_user_id=u.id AND status='published') AS seller_rating,
         (SELECT COUNT(*) FROM reviews WHERE target_user_id=u.id AND status='published') AS seller_reviews
  FROM listings l
  JOIN users u ON u.id=l.seller_id
  LEFT JOIN profiles p ON p.user_id=u.id
  LEFT JOIN categories c ON c.id=l.category_id`;

/** Descendant category ids (recursive tree walk). */
function descendants(id) {
  const out = [id];
  let frontier = [id];
  while (frontier.length) {
    const rows = q.all(`SELECT id FROM categories WHERE parent_id IN (${frontier.map(() => '?').join(',')})`, frontier);
    frontier = rows.map((x) => x.id);
    out.push(...frontier);
  }
  return out;
}

/** Backend-driven faceted search. Every filter is a real SQL predicate. */
/**
 * Resolve per-locale text on listing rows.
 *
 * Views across the app print `l.title` / `l.description` directly (20+ templates), so
 * rather than touch every one of them we overwrite those fields in place with the
 * best match for the active locale. Falls back to the source value when a translation
 * is missing, which means a half-translated catalogue degrades gracefully instead of
 * rendering blanks.
 */
function localizeRows(rows, locale) {
  if (!rows) return rows;
  const list = Array.isArray(rows) ? rows : [rows];
  for (const r of list) {
    if (!r) continue;
    const t = r[`title_${locale}`];
    if (t && String(t).trim()) r.title = t;
    const d = r[`description_${locale}`];
    if (d && String(d).trim()) r.description = d;
  }
  return rows;
}

function searchListings(f = {}) {
  const w = [`l.status='approved'`];
  const p = [];
  if (f.q) {
    w.push(`(l.title LIKE ? OR l.description LIKE ? OR l.variety LIKE ? OR u.display_name LIKE ? OR p.business_name LIKE ?)`);
    const s = `%${f.q}%`; p.push(s, s, s, s, s);
  }
  if (f.category_id) {
    const ids = descendants(+f.category_id);
    w.push(`l.category_id IN (${ids.map(() => '?').join(',')})`); p.push(...ids);
  }
  if (f.type) { w.push('l.listing_type=?'); p.push(f.type); }
  if (f.country) { w.push('l.origin_country=?'); p.push(f.country); }
  if (f.province) { w.push('l.origin_province=?'); p.push(f.province); }
  if (f.city) { w.push('l.origin_city LIKE ?'); p.push(`%${f.city}%`); }
  if (f.currency) { w.push('l.currency=?'); p.push(f.currency); }
  if (f.min_price) { w.push('l.price >= ?'); p.push(+f.min_price); }
  if (f.max_price) { w.push('l.price <= ?'); p.push(+f.max_price); }
  if (f.max_moq) { w.push('l.moq <= ?'); p.push(+f.max_moq); }
  if (f.in_stock) w.push(`l.availability='in_stock' AND l.inventory > 0`);
  if (f.negotiable) w.push('l.negotiable=1');
  if (f.verified) w.push(`EXISTS (SELECT 1 FROM kyc_cases k WHERE k.user_id=u.id AND k.status='approved')`);
  if (f.seller_type) { w.push('p.seller_type=?'); p.push(f.seller_type); }
  if (f.seller_id) { w.push('l.seller_id=?'); p.push(+f.seller_id); }
  if (f.featured) w.push('l.is_featured=1');
  if (f.min_rating) {
    w.push(`(SELECT AVG(score) FROM reviews WHERE target_user_id=u.id AND status='published') >= ?`);
    p.push(+f.min_rating);
  }
  if (f.certificate) { w.push('l.certifications LIKE ?'); p.push(`%${f.certificate}%`); }

  const sortMap = {
    relevance: 'l.boost_rank DESC, l.is_featured DESC, l.published_at DESC',
    newest: 'l.published_at DESC, l.id DESC',
    price_asc: 'l.price ASC',
    price_desc: 'l.price DESC',
    popular: 'l.views_count DESC',
    rating: 'seller_rating DESC',
  };
  const order = sortMap[f.sort] || sortMap.relevance;
  const where = 'WHERE ' + w.join(' AND ');
  const { page, perPage, offset } = H.paginate(f.page, f.perPage || 12);

  const total = q.get(
    `SELECT COUNT(*) c FROM listings l JOIN users u ON u.id=l.seller_id LEFT JOIN profiles p ON p.user_id=u.id ${where}`, p).c;
  const rows = localizeRows(
    q.all(`${LISTING_SELECT} ${where} ORDER BY ${order} LIMIT ? OFFSET ?`, [...p, perPage, offset]),
    f.locale || 'fa');
  return { rows, total, page, perPage, pages: Math.max(1, Math.ceil(total / perPage)) };
}

/** Facet counts computed from live data. */
function facets(f = {}) {
  return {
    countries: q.all(`SELECT origin_country code, COUNT(*) c FROM listings WHERE status='approved' AND origin_country IS NOT NULL GROUP BY origin_country ORDER BY c DESC LIMIT 14`),
    types: q.all(`SELECT listing_type code, COUNT(*) c FROM listings WHERE status='approved' GROUP BY listing_type`),
    sellerTypes: q.all(`SELECT p.seller_type code, COUNT(*) c FROM listings l JOIN profiles p ON p.user_id=l.seller_id WHERE l.status='approved' AND p.seller_type IS NOT NULL GROUP BY p.seller_type`),
    currencies: q.all(`SELECT currency code, COUNT(*) c FROM listings WHERE status='approved' GROUP BY currency`),
    priceRange: q.get(`SELECT MIN(price) lo, MAX(price) hi FROM listings WHERE status='approved' AND price IS NOT NULL`),
  };
}

/* ================= HOMEPAGE ================= */
r.get('/', (req, res) => {
  const stats = {
    suppliers: q.get(`SELECT COUNT(DISTINCT seller_id) c FROM listings WHERE status='approved'`).c,
    listings: q.get(`SELECT COUNT(*) c FROM listings WHERE status='approved'`).c,
    requests: q.get(`SELECT COUNT(*) c FROM buy_requests WHERE status='approved'`).c,
    countries: q.get(`SELECT COUNT(DISTINCT origin_country) c FROM listings WHERE status='approved'`).c,
  };
  const cats = q.all(`
    SELECT c.*, (
      SELECT COUNT(*) FROM listings l
      WHERE l.status='approved'
        AND (l.category_id = c.id
             OR l.category_id IN (SELECT id FROM categories WHERE parent_id = c.id)
             OR l.category_id IN (SELECT id FROM categories
                                  WHERE parent_id IN (SELECT id FROM categories WHERE parent_id = c.id)))
    ) AS cnt
    FROM categories c WHERE c.parent_id IS NULL AND c.status='active' ORDER BY c.sort_order, c.id LIMIT 12`);
  res.render('catalog/home', {
    title: null,
    stats, cats,
    trending: searchListings({ sort: 'popular', perPage: 8, locale: res.locals.locale }).rows,
    fresh: searchListings({ sort: 'newest', perPage: 8, locale: res.locals.locale }).rows,
    featured: searchListings({ featured: 1, perPage: 4, locale: res.locals.locale }).rows,
    suppliers: q.all(`
      SELECT u.id,u.display_name,u.avatar,u.trust_score,p.business_name,p.country,p.city,p.seller_type,p.about,
        (SELECT COUNT(*) FROM listings l WHERE l.seller_id=u.id AND l.status='approved') AS listing_count,
        (SELECT ROUND(AVG(score),1) FROM reviews WHERE target_user_id=u.id AND status='published') AS rating,
        (SELECT COUNT(*) FROM kyc_cases k WHERE k.user_id=u.id AND k.status='approved') AS kyc_ok
      FROM users u JOIN profiles p ON p.user_id=u.id
      WHERE u.status='active' AND EXISTS (SELECT 1 FROM listings l WHERE l.seller_id=u.id AND l.status='approved')
      ORDER BY kyc_ok DESC, u.trust_score DESC LIMIT 6`),
    requests: q.all(`
      SELECT b.*, u.display_name buyer_name, u.avatar buyer_avatar, p.country, p.city,
        c.name_fa cat_name_fa, c.name_en cat_name_en, c.name_tr cat_name_tr, c.name_ar cat_name_ar
      FROM buy_requests b JOIN users u ON u.id=b.buyer_id
      LEFT JOIN profiles p ON p.user_id=u.id LEFT JOIN categories c ON c.id=b.category_id
      WHERE b.status='approved' ORDER BY b.id DESC LIMIT 6`),
    stories: q.all(`
      SELECT s.*, u.display_name, u.avatar FROM stories s JOIN users u ON u.id=s.user_id
      WHERE s.status='active' ORDER BY s.id DESC LIMIT 14`),
    ads: q.all(`SELECT * FROM ad_campaigns WHERE status='active' AND placement='hero' ORDER BY id DESC LIMIT 3`),
    posts: q.all(`SELECT * FROM blog_posts WHERE status='published' ORDER BY id DESC LIMIT 3`),
  });
});

/* ================= PRODUCTS / SEARCH ================= */
function renderList(req, res, extra = {}) {
  const f = { ...req.query, ...extra };
  f.locale = res.locals.locale;
  const result = searchListings(f);
  if (f.q) q.run('INSERT INTO search_events (user_id,q,scope,results) VALUES (?,?,?,?)',
    [req.user ? req.user.id : null, f.q, 'listings', result.total]);
  res.render('catalog/list', {
    title: extra.pageTitle || res.locals.t('nav_products'),
    result, f, facets: facets(f),
    category: extra.category || null,
    cats: q.all(`SELECT c.*, (SELECT COUNT(*) FROM listings l WHERE l.category_id=c.id AND l.status='approved') cnt
                 FROM categories c WHERE c.parent_id IS NULL AND c.status='active' ORDER BY c.sort_order`),
    subcats: extra.category
      ? q.all(`SELECT c.*, (SELECT COUNT(*) FROM listings l WHERE l.category_id=c.id AND l.status='approved') cnt
               FROM categories c WHERE c.parent_id=? AND c.status='active' ORDER BY c.sort_order`, [extra.category.id])
      : [],
  });
}

r.get('/products', (req, res) => renderList(req, res));
r.get('/search', (req, res) => renderList(req, res, { pageTitle: `${res.locals.t('search')}: ${req.query.q || ''}` }));

r.get('/category/:slug', (req, res) => {
  const cat = q.get('SELECT * FROM categories WHERE slug=?', [req.params.slug]);
  if (!cat) return res.status(404).render('errors/404');
  const parent = cat.parent_id ? q.get('SELECT * FROM categories WHERE id=?', [cat.parent_id]) : null;
  renderList(req, res, {
    category: cat, parent, category_id: cat.id,
    pageTitle: res.locals.pick(cat, 'name'),
  });
});

r.get('/categories', (req, res) => {
  const roots = q.all(`SELECT * FROM categories WHERE parent_id IS NULL AND status='active' ORDER BY sort_order`);
  res.render('catalog/categories', {
    title: res.locals.t('cat_all'),
    tree: roots.map((c) => ({
      ...c,
      cnt: q.get(`SELECT COUNT(*) c FROM listings WHERE category_id IN (${descendants(c.id).join(',')}) AND status='approved'`).c,
      children: q.all(`SELECT c.*, (SELECT COUNT(*) FROM listings l WHERE l.category_id=c.id AND l.status='approved') cnt
                       FROM categories c WHERE c.parent_id=? AND c.status='active' ORDER BY sort_order`, [c.id]),
    })),
  });
});

/* ================= PRODUCT DETAIL ================= */
r.get('/product/:slug', (req, res) => {
  const l = localizeRows(q.get(`${LISTING_SELECT} WHERE l.slug=? OR l.id=?`, [req.params.slug, req.params.slug]), res.locals.locale);
  if (!l) return res.status(404).render('errors/404');
  const owner = req.user && req.user.id === l.seller_id;
  if (l.status !== 'approved' && !owner && !(req.user && req.user.is_admin))
    return res.status(404).render('errors/404');

  // real view analytics
  const today = new Date().toISOString().slice(0, 10);
  q.run('INSERT INTO listing_views (listing_id,viewer_id,day,source) VALUES (?,?,?,?)',
    [l.id, req.user ? req.user.id : null, today, req.get('referer') ? 'referral' : 'direct']);
  q.run('UPDATE listings SET views_count=views_count+1 WHERE id=?', [l.id]);
  H.track('listing_view', { actor_id: req.user ? req.user.id : null, target_type: 'listing', target_id: l.id, req });

  const seller = q.get('SELECT * FROM users WHERE id=?', [l.seller_id]);
  seller.profile = q.get('SELECT * FROM profiles WHERE user_id=?', [l.seller_id]) || {};

  res.render('catalog/product', {
    title: l.title, metaDesc: (l.description || '').slice(0, 155),
    l, seller, owner,
    media: q.all('SELECT * FROM listing_media WHERE listing_id=? ORDER BY sort_order, id', [l.id]),
    attrs: q.all(`SELECT la.*, a.label_fa,a.label_en,a.label_tr,a.label_ar,a.unit,a.data_type
                  FROM listing_attributes la LEFT JOIN attributes a ON a.id=la.attribute_id
                  WHERE la.listing_id=?`, [l.id]),
    priceHistory: q.all('SELECT * FROM listing_price_history WHERE listing_id=? ORDER BY id DESC LIMIT 6', [l.id]),
    reviews: q.all(`SELECT r.*, u.display_name, u.avatar FROM reviews r JOIN users u ON u.id=r.reviewer_id
                    WHERE r.target_user_id=? AND r.status='published' ORDER BY r.id DESC LIMIT 5`, [l.seller_id]),
    others: localizeRows(q.all(`${LISTING_SELECT} WHERE l.seller_id=? AND l.id!=? AND l.status='approved' LIMIT 4`, [l.seller_id, l.id]), res.locals.locale),
    similar: localizeRows(q.all(`${LISTING_SELECT} WHERE l.category_id=? AND l.id!=? AND l.status='approved' ORDER BY l.boost_rank DESC LIMIT 4`, [l.category_id, l.id]), res.locals.locale),
    breadcrumb: (() => {
      const path = []; let c = l.category_id ? q.get('SELECT * FROM categories WHERE id=?', [l.category_id]) : null;
      while (c) { path.unshift(c); c = c.parent_id ? q.get('SELECT * FROM categories WHERE id=?', [c.parent_id]) : null; }
      return path;
    })(),
    canPhone: H.canSeePhone(req.user, l.seller_id),
    saved: req.user ? !!q.get(`SELECT 1 x FROM bookmarks WHERE user_id=? AND target_type='listing' AND target_id=?`, [req.user.id, l.id]) : false,
  });
});

/* ================= SUPPLIERS / BUYERS DIRECTORY ================= */
function directory(req, res, mode) {
  const w = [`u.status='active'`];
  const p = [];
  if (mode === 'seller') w.push(`EXISTS (SELECT 1 FROM listings l WHERE l.seller_id=u.id AND l.status='approved')`);
  else w.push(`EXISTS (SELECT 1 FROM buy_requests b WHERE b.buyer_id=u.id AND b.status='approved')`);
  if (req.query.q) { w.push(`(u.display_name LIKE ? OR p.business_name LIKE ? OR p.about LIKE ?)`); const s = `%${req.query.q}%`; p.push(s, s, s); }
  if (req.query.country) { w.push('p.country=?'); p.push(req.query.country); }
  if (req.query.city) { w.push('p.city LIKE ?'); p.push(`%${req.query.city}%`); }
  if (req.query.seller_type) { w.push('p.seller_type=?'); p.push(req.query.seller_type); }
  if (req.query.category_id) { w.push('p.category_id=?'); p.push(+req.query.category_id); }
  if (req.query.verified) w.push(`EXISTS (SELECT 1 FROM kyc_cases k WHERE k.user_id=u.id AND k.status='approved')`);
  const where = 'WHERE ' + w.join(' AND ');
  const { page, perPage, offset } = H.paginate(req.query.page, 12);
  const total = q.get(`SELECT COUNT(*) c FROM users u JOIN profiles p ON p.user_id=u.id ${where}`, p).c;
  const rows = q.all(`
    SELECT u.id,u.display_name,u.avatar,u.trust_score,u.created_at,
      p.business_name,p.country,p.city,p.about,p.seller_type,p.response_rate,p.logo,p.cover,
      (SELECT COUNT(*) FROM listings l WHERE l.seller_id=u.id AND l.status='approved') listing_count,
      (SELECT COUNT(*) FROM buy_requests b WHERE b.buyer_id=u.id AND b.status='approved') request_count,
      (SELECT ROUND(AVG(score),1) FROM reviews WHERE target_user_id=u.id AND status='published') rating,
      (SELECT COUNT(*) FROM reviews WHERE target_user_id=u.id AND status='published') review_count,
      (SELECT COUNT(*) FROM kyc_cases k WHERE k.user_id=u.id AND k.status='approved') kyc_ok
    FROM users u JOIN profiles p ON p.user_id=u.id ${where}
    ORDER BY kyc_ok DESC, u.trust_score DESC, u.id DESC LIMIT ? OFFSET ?`, [...p, perPage, offset]);
  res.render('catalog/directory', {
    title: mode === 'seller' ? res.locals.t('nav_suppliers') : res.locals.t('nav_buyers'),
    mode, rows, total, page, pages: Math.max(1, Math.ceil(total / perPage)),
    countries: q.all(`SELECT DISTINCT country code FROM profiles WHERE country IS NOT NULL`),
    cats: q.all(`SELECT * FROM categories WHERE parent_id IS NULL ORDER BY sort_order`),
  });
}
r.get('/suppliers', (req, res) => directory(req, res, 'seller'));
r.get('/buyers', (req, res) => directory(req, res, 'buyer'));

/* ================= PUBLIC STOREFRONT ================= */
r.get('/u/:id', (req, res) => {
  const u = q.get(`SELECT * FROM users WHERE id=? AND status='active'`, [req.params.id]);
  if (!u) return res.status(404).render('errors/404');
  u.profile = q.get('SELECT * FROM profiles WHERE user_id=?', [u.id]) || {};
  const today = new Date().toISOString().slice(0, 10);
  q.run('INSERT INTO profile_views (profile_user_id,viewer_id,day) VALUES (?,?,?)', [u.id, req.user ? req.user.id : null, today]);

  res.render('catalog/storefront', {
    title: u.profile.business_name || u.display_name,
    u,
    verified: H.isVerified(u.id),
    trust: u.trust_score,
    listings: localizeRows(q.all(`${LISTING_SELECT} WHERE l.seller_id=? AND l.status='approved' ORDER BY l.boost_rank DESC, l.id DESC LIMIT 12`, [u.id]), res.locals.locale),
    requests: q.all(`SELECT * FROM buy_requests WHERE buyer_id=? AND status='approved' ORDER BY id DESC LIMIT 8`, [u.id]),
    reviews: q.all(`SELECT r.*, ru.display_name, ru.avatar FROM reviews r JOIN users ru ON ru.id=r.reviewer_id
                    WHERE r.target_user_id=? AND r.status='published' ORDER BY r.id DESC`, [u.id]),
    rating: q.get(`SELECT ROUND(AVG(score),1) a, COUNT(*) c FROM reviews WHERE target_user_id=? AND status='published'`, [u.id]),
    team: q.all('SELECT * FROM team_members WHERE owner_id=?', [u.id]),
    stories: q.all(`SELECT * FROM stories WHERE user_id=? AND status='active' ORDER BY id DESC`, [u.id]),
    canPhone: H.canSeePhone(req.user, u.id),
    following: req.user ? !!q.get('SELECT 1 x FROM follows WHERE follower_id=? AND followee_id=?', [req.user.id, u.id]) : false,
    saved: req.user ? !!q.get(`SELECT 1 x FROM bookmarks WHERE user_id=? AND target_type='user' AND target_id=?`, [req.user.id, u.id]) : false,
    lists: req.user ? q.all('SELECT * FROM saved_lists WHERE owner_id=?', [req.user.id]) : [],
    counts: {
      listings: q.get(`SELECT COUNT(*) c FROM listings WHERE seller_id=? AND status='approved'`, [u.id]).c,
      requests: q.get(`SELECT COUNT(*) c FROM buy_requests WHERE buyer_id=? AND status='approved'`, [u.id]).c,
      followers: q.get('SELECT COUNT(*) c FROM follows WHERE followee_id=?', [u.id]).c,
      orders: q.get(`SELECT COUNT(*) c FROM orders WHERE seller_id=? AND status IN ('completed','delivered')`, [u.id]).c,
    },
  });
});

/* review submission */
r.post('/u/:id/review', (req, res) => {
  if (!req.user) return res.redirect('/auth/login');
  const target = +req.params.id;
  if (target === req.user.id) { flash(req, 'err', 'ثبت نظر برای خود امکان‌پذیر نیست'); return res.redirect('/u/' + target); }
  const verified = !!q.get(`SELECT 1 x FROM orders WHERE buyer_id=? AND seller_id=? AND status IN ('completed','delivered')`, [req.user.id, target]);
  q.run('INSERT INTO reviews (target_user_id,reviewer_id,score,body,transaction_verified) VALUES (?,?,?,?,?)',
    [target, req.user.id, Math.max(1, Math.min(5, +req.body.score || 5)), req.body.body || null, verified ? 1 : 0]);
  H.trustScore(target);
  H.notify(target, { type: 'review', title: 'نظر جدید', body: 'کاربری برای شما نظر ثبت کرد.', link: '/u/' + target });
  flash(req, 'ok', 'نظر شما ثبت شد ✓');
  res.redirect('/u/' + target);
});

r.post('/u/:id/follow', (req, res) => {
  if (!req.user) return res.redirect('/auth/login');
  const t = +req.params.id;
  const ex = q.get('SELECT id FROM follows WHERE follower_id=? AND followee_id=?', [req.user.id, t]);
  if (ex) q.run('DELETE FROM follows WHERE id=?', [ex.id]);
  else q.run('INSERT INTO follows (follower_id,followee_id) VALUES (?,?)', [req.user.id, t]);
  res.redirect('/u/' + t);
});

module.exports = { router: r, searchListings, LISTING_SELECT, descendants };
