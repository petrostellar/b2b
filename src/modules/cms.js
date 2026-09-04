/** Public CMS, help/guides, blog, SEO endpoints. */
const express = require('express');
const { q } = require('../db');
const H = require('../lib/helpers');

const r = express.Router();

r.get('/page/:slug', (req, res) => {
  const p = q.get(`SELECT * FROM pages WHERE slug=? AND status='published'`, [req.params.slug]);
  if (!p) return res.status(404).render('errors/404');
  res.render('pages/page', { title: res.locals.pick(p, 'title'), metaDesc: p.seo_description, p });
});

r.get('/about', (req, res) => res.redirect('/page/about'));
r.get('/contact', (req, res) => res.render('pages/contact', { title: res.locals.t('nav_contact') }));

r.get('/help', (req, res) => {
  res.render('pages/help', { title: res.locals.t('nav_help'),
    faqs: q.all('SELECT * FROM faqs ORDER BY sort_order, id'),
    groups: [...new Set(q.all('SELECT DISTINCT group_name g FROM faqs').map((x) => x.g))] });
});

r.get('/guide/:kind', (req, res) => {
  const guides = {
    seller: { title: 'راهنمای فروشندگان', steps: [
      ['ثبت‌نام و انتخاب نقش فروشنده', 'با شماره موبایل وارد شوید و در مرحله تکمیل حساب گزینه «فروشنده‌ام» را انتخاب کنید.'],
      ['تکمیل احراز هویت (KYC)', 'مدارک هویتی خود را بارگذاری کنید تا نشان «تأییدشده» دریافت کنید. آگهی فروشندگان احراز شده تا ۳ برابر بیشتر دیده می‌شود.'],
      ['تکمیل پروفایل و غرفه', 'لوگو، کاور، معرفی کسب‌وکار، بازارهای صادراتی و اینکوترمزها را وارد کنید.'],
      ['ثبت کالا در ۷ مرحله', 'دسته‌بندی، مبدأ، ارزش تجاری، تصاویر، توضیحات، مشخصات پویا و بازبینی نهایی.'],
      ['پاسخ به درخواست خریداران', 'در فید درخواست‌های خرید، پیشنهاد قیمت (پیش‌فاکتور) ارسال کنید.'],
      ['مذاکره و نهایی‌سازی', 'نسخه‌های پیش‌فاکتور را مذاکره کنید و پس از توافق سفارش ایجاد کنید.'],
      ['ارتقا و نردبان', 'با نردبان و عضویت ویژه رتبه آگهی و دسترسی به شماره خریداران را افزایش دهید.'],
    ] },
    buyer: { title: 'راهنمای خریداران', steps: [
      ['ثبت‌نام سریع', 'ورود بدون رمز با کد یکبار مصرف پیامکی.'],
      ['جستجو و فیلتر پیشرفته', 'بر اساس دسته، کشور مبدأ، قیمت، MOQ، گواهی و امتیاز فروشنده فیلتر کنید.'],
      ['ثبت درخواست خرید (RFQ)', 'نیاز خود را ثبت کنید تا تأمین‌کنندگان مرتبط پیشنهاد بدهند.'],
      ['مقایسه پیشنهادها', 'پیش‌فاکتورهای دریافتی را از نظر قیمت، اینکوترمز و زمان تحویل مقایسه کنید.'],
      ['مذاکره و واگذاری', 'با فروشنده مذاکره کنید و پیشنهاد برنده را انتخاب کنید.'],
      ['پرداخت امن', 'با پرداخت امانی، وجه تا تأیید دریافت کالا نزد پلتفرم می‌ماند.'],
      ['ثبت نظر', 'پس از تکمیل معامله، تجربه خود را ثبت کنید.'],
    ] },
    kyc: { title: 'راهنمای احراز هویت', steps: [
      ['چرا احراز هویت؟', 'اعتماد خریداران، رتبه بهتر در جستجو و دسترسی به امکانات پیشرفته.'],
      ['مدارک لازم — اشخاص حقیقی', 'کارت ملی یا پاسپورت (روی و پشت) + عکس شما همراه مدرک و دست‌نوشته.'],
      ['مدارک لازم — اشخاص حقوقی (KYB)', 'گواهی ثبت شرکت، شناسه مالیاتی، آگهی روزنامه رسمی و مدارک شخص مجاز.'],
      ['نکات تصویربرداری', 'رنگی، واضح، بدون برش گوشه‌ها و بدون انعکاس نور.'],
      ['زمان بررسی', 'معمولاً کمتر از ۲۴ ساعت کاری. نتیجه از طریق اعلان اطلاع داده می‌شود.'],
      ['رد شدن یا نیاز به اصلاح', 'دلیل دقیق در پرونده نمایش داده می‌شود و می‌توانید مدارک را دوباره ارسال کنید.'],
    ] },
  };
  const g = guides[req.params.kind];
  if (!g) return res.status(404).render('errors/404');
  res.render('pages/guide', { title: g.title, g });
});

r.get('/blog', (req, res) => {
  res.render('pages/blog', { title: res.locals.t('nav_blog'),
    rows: q.all(`SELECT * FROM blog_posts WHERE status='published' ORDER BY id DESC`) });
});
r.get('/blog/:slug', (req, res) => {
  const p = q.get('SELECT * FROM blog_posts WHERE slug=?', [req.params.slug]);
  if (!p) return res.status(404).render('errors/404');
  res.render('pages/post', { title: p.title, metaDesc: p.excerpt, p });
});

/* ---------- Ad click tracking ---------- */
r.get('/ads/:id/click', (req, res) => {
  const a = q.get('SELECT * FROM ad_campaigns WHERE id=?', [req.params.id]);
  if (!a) return res.redirect('/');
  q.run('UPDATE ad_campaigns SET clicks=clicks+1 WHERE id=?', [a.id]);
  H.track('ad_click', { actor_id: req.user ? req.user.id : null, target_type: 'ad', target_id: a.id, req });
  res.redirect(a.link_url || '/');
});

/* ---------- SEO ---------- */
r.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /account\nDisallow: /messages\nSitemap: ${req.protocol}://${req.get('host')}/sitemap.xml\n`);
});

r.get('/sitemap.xml', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  const urls = [
    { loc: '/', p: '1.0' }, { loc: '/products', p: '0.9' }, { loc: '/categories', p: '0.8' },
    { loc: '/suppliers', p: '0.8' }, { loc: '/buyers', p: '0.7' }, { loc: '/buy-requests', p: '0.8' },
    { loc: '/pricing', p: '0.6' }, { loc: '/blog', p: '0.6' }, { loc: '/help', p: '0.5' },
  ];
  q.all(`SELECT slug FROM categories WHERE status='active'`).forEach((c) => urls.push({ loc: '/category/' + c.slug, p: '0.8' }));
  q.all(`SELECT slug,id,updated_at FROM listings WHERE status='approved'`).forEach((l) => urls.push({ loc: '/product/' + (l.slug || l.id), p: '0.7', m: l.updated_at }));
  q.all(`SELECT id FROM buy_requests WHERE status='approved'`).forEach((b) => urls.push({ loc: '/buy-requests/' + b.id, p: '0.6' }));
  q.all(`SELECT slug FROM pages WHERE status='published'`).forEach((p) => urls.push({ loc: '/page/' + p.slug, p: '0.5' }));
  q.all(`SELECT slug FROM blog_posts WHERE status='published'`).forEach((p) => urls.push({ loc: '/blog/' + p.slug, p: '0.5' }));

  const langs = ['fa', 'en', 'tr', 'ar'];
  const body = urls.map((u) => `  <url>
    <loc>${base}${u.loc}</loc>${u.m ? `\n    <lastmod>${u.m.slice(0, 10)}</lastmod>` : ''}
    <priority>${u.p}</priority>
${langs.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${base}${u.loc}?lang=${l}"/>`).join('\n')}
  </url>`).join('\n');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${body}
</urlset>`);
});

module.exports = r;
