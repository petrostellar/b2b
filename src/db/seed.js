/* eslint-disable no-console */
/** Seeds platform reference data + demo commercial content. Idempotent. */
require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db, q, migrate } = require('./index');
const { THEMES, THEME_CODES } = require('../lib/themes');
const H = require('../lib/helpers');
const { LISTING_TITLES, BLOG_TITLES, REQUEST_TITLES, STORY_CAPTIONS, AD_COPY } = require('./translations');

migrate();

const up = (sql, p = []) => q.run(sql, p);
const uuid = () => crypto.randomUUID();
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rnd = (a, b) => Math.floor(a + Math.random() * (b - a + 1));

/* ---------------- languages ---------------- */
[['fa', 'Persian', 'فارسی', 'rtl', 1, 1], ['en', 'English', 'English', 'ltr', 1, 0],
 ['tr', 'Turkish', 'Türkçe', 'ltr', 1, 0], ['ar', 'Arabic', 'العربية', 'rtl', 1, 0]]
  .forEach(([code, name, native, dir, en, def], i) => up(
    `INSERT INTO languages (code,name,native_name,dir,enabled,is_default,sort_order) VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(code) DO UPDATE SET name=excluded.name,native_name=excluded.native_name,dir=excluded.dir`,
    [code, name, native, dir, en, def, i]));

/* ---------------- currencies ---------------- */
[['TRY', '₺', 'Turkish Lira', 1], ['USD', '$', 'US Dollar', 0.029], ['EUR', '€', 'Euro', 0.027],
 ['AED', 'د.إ', 'UAE Dirham', 0.107], ['IRR', 'ریال', 'Iranian Rial', 1250], ['GBP', '£', 'Pound Sterling', 0.023]]
  .forEach(([code, sym, name, rate]) => up(
    `INSERT INTO currencies (code,symbol,name,rate_to_base,enabled) VALUES (?,?,?,?,1)
     ON CONFLICT(code) DO UPDATE SET symbol=excluded.symbol,name=excluded.name,rate_to_base=excluded.rate_to_base`,
    [code, sym, name, rate]));

/* ---------------- countries ---------------- */
[['TR', 'ترکیه', 'Türkiye', '+90'], ['IR', 'ایران', 'Iran', '+98'], ['AE', 'امارات', 'United Arab Emirates', '+971'],
 ['DE', 'آلمان', 'Germany', '+49'], ['IQ', 'عراق', 'Iraq', '+964'], ['SA', 'عربستان', 'Saudi Arabia', '+966'],
 ['CN', 'چین', 'China', '+86'], ['IN', 'هند', 'India', '+91'], ['RU', 'روسیه', 'Russia', '+7'],
 ['GB', 'انگلستان', 'United Kingdom', '+44'], ['NL', 'هلند', 'Netherlands', '+31'], ['IT', 'ایتالیا', 'Italy', '+39'],
 ['AZ', 'آذربایجان', 'Azerbaijan', '+994'], ['QA', 'قطر', 'Qatar', '+974'], ['OM', 'عمان', 'Oman', '+968'],
 ['PK', 'پاکستان', 'Pakistan', '+92'], ['AF', 'افغانستان', 'Afghanistan', '+93'], ['US', 'آمریکا', 'United States', '+1']]
  .forEach(([c, fa, en, d]) => up(
    `INSERT INTO countries (code,name_fa,name_en,dial_code,enabled) VALUES (?,?,?,?,1)
     ON CONFLICT(code) DO UPDATE SET name_fa=excluded.name_fa,name_en=excluded.name_en`, [c, fa, en, d]));

[['TR', 'استانبول', 'Istanbul'], ['TR', 'ازمیر', 'Izmir'], ['TR', 'آنکارا', 'Ankara'], ['TR', 'بورسا', 'Bursa'],
 ['IR', 'تهران', 'Tehran'], ['IR', 'اصفهان', 'Isfahan'], ['IR', 'مشهد', 'Mashhad'], ['IR', 'تبریز', 'Tabriz'],
 ['AE', 'دبی', 'Dubai'], ['AE', 'ابوظبی', 'Abu Dhabi'], ['DE', 'هامبورگ', 'Hamburg'], ['DE', 'برلین', 'Berlin']]
  .forEach(([cc, fa, en]) => {
    if (!q.get('SELECT 1 x FROM regions WHERE country_code=? AND name_en=?', [cc, en]))
      up('INSERT INTO regions (country_code,name_fa,name_en) VALUES (?,?,?)', [cc, fa, en]);
  });

/* ---------------- units ---------------- */
[['kg', 'کیلوگرم', 'Kilogram', 'Kilogram', 'كيلوغرام', 'weight'], ['ton', 'تن', 'Ton', 'Ton', 'طن', 'weight'],
 ['g', 'گرم', 'Gram', 'Gram', 'غرام', 'weight'], ['pcs', 'عدد', 'Piece', 'Adet', 'قطعة', 'count'],
 ['box', 'کارتن', 'Box', 'Kutu', 'صندوق', 'count'], ['pallet', 'پالت', 'Pallet', 'Palet', 'منصة', 'count'],
 ['container', 'کانتینر', 'Container', 'Konteyner', 'حاوية', 'count'], ['m', 'متر', 'Meter', 'Metre', 'متر', 'length'],
 ['m2', 'متر مربع', 'Square meter', 'Metrekare', 'متر مربع', 'area'], ['m3', 'متر مکعب', 'Cubic meter', 'Metreküp', 'متر مكعب', 'volume'],
 ['liter', 'لیتر', 'Liter', 'Litre', 'لتر', 'volume'], ['hour', 'ساعت', 'Hour', 'Saat', 'ساعة', 'count'],
 ['project', 'پروژه', 'Project', 'Proje', 'مشروع', 'count'], ['roll', 'رول', 'Roll', 'Rulo', 'لفة', 'count']]
  .forEach(([code, fa, en, tr, ar, kind]) => up(
    `INSERT INTO units (code,name_fa,name_en,name_tr,name_ar,kind) VALUES (?,?,?,?,?,?)
     ON CONFLICT(code) DO UPDATE SET name_fa=excluded.name_fa`, [code, fa, en, tr, ar, kind]));

/* ---------------- themes ---------------- */
THEME_CODES.forEach((code, i) => up(
  `INSERT INTO themes (code,name,tokens_json,enabled,is_default) VALUES (?,?,?,1,?)
   ON CONFLICT(code) DO UPDATE SET name=excluded.name, tokens_json=excluded.tokens_json`,
  [code, THEMES[code].name, JSON.stringify(THEMES[code].vars || THEMES[code]), i === 0 ? 1 : 0]));

/* ---------------- settings & flags ---------------- */
Object.entries({
  site_name: 'MYDAN', site_tagline_fa: 'میدان تجارت جهانی', site_tagline_en: 'The Global Trade Field',
  default_theme: 'luxury', default_locale: 'fa', default_currency: 'TRY',
  support_email: 'support@mydan.market', sales_email: 'sales@mydan.market',
  commission_percent: '3', escrow_hold_days: '7', listing_auto_approve: '0',
  otp_ttl_minutes: '5', boost_price_minor: '9900', min_order_minor: '0',
  seo_title_suffix: 'MYDAN', analytics_enabled: '1',
}).forEach(([k, v]) => H.setSetting(k, v));

[['messaging', 1, 'گفتگوی درون‌سایتی'], ['escrow', 1, 'پرداخت امانی'], ['stories', 1, 'استوری تجاری'],
 ['ads', 1, 'تبلیغات و بنر'], ['boost', 1, 'نردبان و ارتقا'], ['rfq', 1, 'درخواست خرید / RFQ'],
 ['retail_cart', 1, 'سبد خرید خرده‌فروشی'], ['reviews', 1, 'نظرات و امتیاز'], ['kyb', 1, 'احراز هویت شرکتی'],
 ['wallet', 1, 'کیف پول'], ['plugins', 1, 'مدیریت افزونه‌ها'], ['public_registration', 1, 'ثبت‌نام عمومی'],
 ['contact_gating', 1, 'محدودسازی نمایش شماره تماس'], ['multi_currency', 1, 'چند ارزی']]
  .forEach(([k, e, d]) => up(
    `INSERT INTO feature_flags (fkey,enabled,description) VALUES (?,?,?)
     ON CONFLICT(fkey) DO UPDATE SET description=excluded.description`, [k, e, d]));

/* ---------------- categories ---------------- */
const CATS = [
  ['agri', '🌾', 'محصولات کشاورزی و غذایی', 'Agriculture & Food', 'Tarım ve Gıda', 'الزراعة والأغذية', [
    ['nuts', 'خشکبار و آجیل', 'Nuts & Dried Fruits'], ['saffron-spice', 'زعفران و ادویه', 'Saffron & Spices'],
    ['fresh-produce', 'میوه و سبزیجات تازه', 'Fresh Produce'], ['grains', 'غلات و حبوبات', 'Grains & Pulses'],
    ['dairy', 'لبنیات', 'Dairy Products'], ['oils', 'روغن‌های خوراکی', 'Edible Oils']]],
  ['textile', '🧵', 'نساجی و پوشاک', 'Textile & Apparel', 'Tekstil ve Giyim', 'المنسوجات والملابس', [
    ['fabric', 'پارچه و منسوجات', 'Fabrics'], ['apparel', 'پوشاک آماده', 'Ready-made Apparel'],
    ['home-textile', 'منسوجات خانگی', 'Home Textile'], ['leather', 'چرم و مصنوعات', 'Leather Goods'],
    ['yarn', 'نخ و الیاف', 'Yarn & Fibers']]],
  ['machinery', '⚙️', 'ماشین‌آلات و تجهیزات صنعتی', 'Machinery & Industrial', 'Makine ve Endüstri', 'الآلات والصناعة', [
    ['food-machinery', 'ماشین‌آلات صنایع غذایی', 'Food Processing Machinery'],
    ['packaging-machinery', 'ماشین‌آلات بسته‌بندی', 'Packaging Machinery'],
    ['cnc', 'ماشین‌ابزار و CNC', 'Machine Tools & CNC'], ['spare-parts', 'قطعات یدکی صنعتی', 'Industrial Spare Parts']]],
  ['construction', '🏗', 'مصالح ساختمانی', 'Construction Materials', 'İnşaat Malzemeleri', 'مواد البناء', [
    ['stone', 'سنگ ساختمانی', 'Building Stone'], ['tile', 'کاشی و سرامیک', 'Tile & Ceramic'],
    ['cement', 'سیمان و گچ', 'Cement & Plaster'], ['steel', 'آهن و فولاد', 'Steel & Iron'],
    ['upvc', 'در و پنجره UPVC', 'UPVC Doors & Windows']]],
  ['chemicals', '🧪', 'مواد شیمیایی و پلیمر', 'Chemicals & Polymers', 'Kimya ve Polimer', 'الكيماويات والبوليمرات', [
    ['petrochem', 'محصولات پتروشیمی', 'Petrochemicals'], ['polymer', 'گرانول و پلیمر', 'Polymer Granules'],
    ['detergent', 'شوینده و بهداشتی', 'Detergents & Hygiene'], ['paint', 'رنگ و رزین', 'Paint & Resin']]],
  ['electronics', '💡', 'برق و الکترونیک', 'Electronics & Electrical', 'Elektronik', 'الإلكترونيات', [
    ['solar', 'انرژی خورشیدی', 'Solar Energy'], ['cable', 'کابل و سیم', 'Cable & Wire'],
    ['lighting', 'روشنایی صنعتی', 'Industrial Lighting'], ['components', 'قطعات الکترونیکی', 'Electronic Components']]],
  ['medical', '🩺', 'تجهیزات پزشکی و دارویی', 'Medical & Pharma', 'Medikal', 'الطبية والصيدلانية', [
    ['disposables', 'مصرفی پزشکی', 'Medical Disposables'], ['lab', 'تجهیزات آزمایشگاهی', 'Laboratory Equipment'],
    ['herbal', 'داروهای گیاهی', 'Herbal Products'], ['cosmetic', 'آرایشی و بهداشتی', 'Cosmetics']]],
  ['services', '🤝', 'خدمات تجاری و لجستیک', 'Business Services & Logistics', 'Hizmetler', 'الخدمات', [
    ['freight', 'حمل و نقل بین‌المللی', 'International Freight'], ['customs', 'ترخیص و گمرک', 'Customs Clearance'],
    ['inspection', 'بازرسی و کنترل کیفیت', 'Inspection & QC'], ['consulting', 'مشاوره صادرات', 'Export Consulting'],
    ['warehouse', 'انبارداری', 'Warehousing']]],
  ['handicraft', '🏺', 'صنایع دستی و فرش', 'Handicraft & Carpet', 'El Sanatları', 'الحرف اليدوية', [
    ['carpet', 'فرش دستباف', 'Handmade Carpet'], ['machine-carpet', 'فرش ماشینی', 'Machine Carpet'],
    ['ceramic-art', 'سفال و سرامیک هنری', 'Art Ceramics'], ['copper', 'مسگری و قلم‌زنی', 'Copperware']]],
  ['auto', '🚚', 'خودرو و قطعات', 'Automotive & Parts', 'Otomotiv', 'السيارات وقطع الغيار', [
    ['auto-parts', 'قطعات خودرو', 'Auto Parts'], ['tires', 'لاستیک', 'Tires'],
    ['heavy-vehicle', 'ماشین‌آلات سنگین', 'Heavy Vehicles'], ['lubricants', 'روغن و روانکار', 'Lubricants']]],
];

function catId(slug) { const r = q.get('SELECT id FROM categories WHERE slug=?', [slug]); return r && r.id; }
CATS.forEach(([slug, icon, fa, en, tr, ar, kids], i) => {
  if (!catId(slug)) up(
    `INSERT INTO categories (slug,name_fa,name_en,name_tr,name_ar,icon,sort_order,seo_title,seo_description)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [slug, fa, en, tr, ar, icon, i, `${fa} | MYDAN`, `خرید و فروش عمده ${fa} از تأمین‌کنندگان تأییدشده در بازار جهانی مایدان.`]);
  const pid = catId(slug);
  kids.forEach(([ks, kfa, ken], j) => {
    if (!catId(ks)) up(
      `INSERT INTO categories (parent_id,slug,name_fa,name_en,name_tr,name_ar,sort_order,seo_title,seo_description)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [pid, ks, kfa, ken, ken, ken, j, `${kfa} | MYDAN`, `تأمین‌کنندگان و قیمت عمده ${kfa}.`]);
  });
});

/* ---------------- attributes ---------------- */
const ATTRS = {
  nuts: [['grade', 'درجه کیفی', 'Grade', 'select', '["A+","A","B","C"]', 1],
    ['moisture', 'رطوبت (%)', 'Moisture (%)', 'decimal', null, 0],
    ['harvest_year', 'سال برداشت', 'Harvest year', 'integer', null, 0],
    ['packing', 'نوع بسته‌بندی', 'Packing', 'select', '["کیسه ۵۰ کیلویی","کارتن ۱۰ کیلویی","وکیوم","فله"]', 1],
    ['organic', 'ارگانیک', 'Organic', 'boolean', null, 0]],
  'saffron-spice': [['type', 'نوع', 'Type', 'select', '["سرگل","نگین","پوشال","دسته"]', 1],
    ['purity', 'خلوص (%)', 'Purity (%)', 'decimal', null, 0],
    ['iso_grade', 'گرید ISO 3632', 'ISO 3632 grade', 'select', '["I","II","III"]', 0]],
  fabric: [['composition', 'ترکیب الیاف', 'Composition', 'text', null, 1],
    ['gsm', 'گرماژ (GSM)', 'GSM', 'integer', null, 1],
    ['width_cm', 'عرض (سانتی‌متر)', 'Width (cm)', 'integer', null, 0],
    ['color_fastness', 'ثبات رنگ', 'Color fastness', 'select', '["4","4-5","5"]', 0]],
  stone: [['stone_type', 'نوع سنگ', 'Stone type', 'select', '["مرمریت","گرانیت","تراورتن","اونیکس","چینی"]', 1],
    ['finish', 'پرداخت سطح', 'Surface finish', 'select', '["پولیش","هونیت","لیدر","تیشه‌ای"]', 1],
    ['thickness_mm', 'ضخامت (mm)', 'Thickness (mm)', 'integer', null, 1]],
  polymer: [['grade_code', 'کد گرید', 'Grade code', 'text', null, 1],
    ['mfi', 'MFI', 'MFI', 'decimal', null, 0],
    ['application', 'کاربرد', 'Application', 'select', '["تزریقی","بادی","فیلم","الیاف"]', 0]],
  'food-machinery': [['capacity', 'ظرفیت (kg/h)', 'Capacity (kg/h)', 'integer', null, 1],
    ['power_kw', 'توان (kW)', 'Power (kW)', 'decimal', null, 0],
    ['warranty_months', 'گارانتی (ماه)', 'Warranty (months)', 'integer', null, 0],
    ['automation', 'سطح اتوماسیون', 'Automation level', 'select', '["دستی","نیمه‌اتوماتیک","تمام‌اتوماتیک"]', 0]],
  carpet: [['knot_density', 'رج‌شمار', 'Knot density', 'integer', null, 1],
    ['material', 'جنس', 'Material', 'select', '["پشم","ابریشم","پشم و ابریشم","کرک"]', 1],
    ['design', 'طرح', 'Design', 'text', null, 0],
    ['size', 'ابعاد', 'Size', 'text', null, 1]],
  solar: [['power_w', 'توان پنل (W)', 'Panel power (W)', 'integer', null, 1],
    ['cell_type', 'نوع سلول', 'Cell type', 'select', '["مونوکریستال","پلی‌کریستال","نازک‌لایه"]', 1],
    ['efficiency', 'راندمان (%)', 'Efficiency (%)', 'decimal', null, 0]],
  freight: [['mode', 'شیوه حمل', 'Mode', 'select', '["دریایی","زمینی","هوایی","ریلی","مولتی‌مودال"]', 1],
    ['route', 'مسیر', 'Route', 'text', null, 1],
    ['transit_days', 'زمان ترانزیت (روز)', 'Transit days', 'integer', null, 0]],
  'auto-parts': [['brand', 'برند', 'Brand', 'text', null, 1],
    ['oem_code', 'کد OEM', 'OEM code', 'text', null, 0],
    ['condition', 'وضعیت', 'Condition', 'select', '["نو","بازسازی‌شده"]', 1]],
};
Object.entries(ATTRS).forEach(([cslug, list]) => {
  const cid = catId(cslug); if (!cid) return;
  list.forEach(([akey, fa, en, dt, opts, req], i) => {
    if (!q.get('SELECT 1 x FROM attributes WHERE category_id=? AND akey=?', [cid, akey]))
      up(`INSERT INTO attributes (category_id,akey,label_fa,label_en,label_tr,label_ar,data_type,options,required,searchable,sort_order)
          VALUES (?,?,?,?,?,?,?,?,?,1,?)`, [cid, akey, fa, en, en, en, dt, opts, req, i]);
  });
});

/* ---------------- plans ---------------- */
const PLANS = [
  ['free', 'پایه (رایگان)', 'Basic', 0, 0, 'TRY', null, 0, [
    ['listing_limit', 'تعداد آگهی فعال', 'Active listings', '3'],
    ['rfq_quota', 'پاسخ به درخواست خرید (ماهانه)', 'RFQ replies / month', '5'],
    ['contact_access', 'مشاهده شماره تماس', 'Contact access', 'off'],
    ['support_level', 'پشتیبانی', 'Support', 'ایمیلی'],
  ]],
  ['silver', 'نقره‌ای', 'Silver', 3, 149000, 'TRY', 'محبوب', 0, [
    ['listing_limit', 'تعداد آگهی فعال', 'Active listings', '25'],
    ['rfq_quota', 'پاسخ به درخواست خرید (ماهانه)', 'RFQ replies / month', '50'],
    ['contact_access', 'مشاهده شماره تماس', 'Contact access', 'on'],
    ['boost_credits', 'اعتبار نردبان', 'Boost credits', '4'],
    ['analytics', 'گزارش‌های تحلیلی', 'Analytics reports', 'on'],
    ['support_level', 'پشتیبانی', 'Support', 'اولویت‌دار'],
  ]],
  ['gold', 'طلایی', 'Gold', 6, 259000, 'TRY', 'پیشنهاد ما', 1, [
    ['listing_limit', 'تعداد آگهی فعال', 'Active listings', '100'],
    ['rfq_quota', 'پاسخ به درخواست خرید (ماهانه)', 'RFQ replies / month', '200'],
    ['contact_access', 'مشاهده شماره تماس', 'Contact access', 'on'],
    ['boost_credits', 'اعتبار نردبان', 'Boost credits', '15'],
    ['featured_slots', 'جایگاه ویژه صفحه اول', 'Homepage featured slots', '2'],
    ['analytics', 'گزارش‌های تحلیلی', 'Analytics reports', 'on'],
    ['verified_badge', 'نشان تأییدشده طلایی', 'Gold verified badge', 'on'],
    ['support_level', 'پشتیبانی', 'Support', 'مدیر حساب اختصاصی'],
  ]],
  ['platinum', 'پلاتینیوم', 'Platinum', 12, 449000, 'TRY', 'سازمانی', 0, [
    ['listing_limit', 'تعداد آگهی فعال', 'Active listings', 'unlimited'],
    ['rfq_quota', 'پاسخ به درخواست خرید (ماهانه)', 'RFQ replies / month', 'unlimited'],
    ['contact_access', 'مشاهده شماره تماس', 'Contact access', 'on'],
    ['boost_credits', 'اعتبار نردبان', 'Boost credits', '40'],
    ['featured_slots', 'جایگاه ویژه صفحه اول', 'Homepage featured slots', '6'],
    ['ads_credit', 'اعتبار تبلیغات بنری', 'Banner ad credit', '2'],
    ['team_seats', 'کاربران تیمی', 'Team seats', '10'],
    ['api_access', 'دسترسی API', 'API access', 'on'],
    ['support_level', 'پشتیبانی', 'Support', 'اختصاصی ۲۴/۷'],
  ]],
];
PLANS.forEach(([code, fa, en, months, price, cur, badge, hl, feats], i) => {
  if (!q.get('SELECT 1 x FROM plans WHERE code=?', [code]))
    up(`INSERT INTO plans (code,name_fa,name_en,name_tr,name_ar,months,price_minor,currency,badge,highlight,sort_order,status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,'active')`, [code, fa, en, en, fa, months, price, cur, badge, hl, i]);
  const pid = q.get('SELECT id FROM plans WHERE code=?', [code]).id;
  feats.forEach(([fk, lfa, len, val]) => {
    if (!q.get('SELECT 1 x FROM plan_features WHERE plan_id=? AND fkey=?', [pid, fk]))
      up('INSERT INTO plan_features (plan_id,fkey,label_fa,label_en,value) VALUES (?,?,?,?,?)', [pid, fk, lfa, len, val]);
  });
});

/* ---------------- CMS ---------------- */
const P = (s) => `<p>${s}</p>`;
const PAGES = [
  ['about', 'درباره مایدان', 'About MYDAN',
    P('مایدان یک بازارگاه تجاری جهانی دوسویه است که تولیدکنندگان، توزیع‌کنندگان، صادرکنندگان و خریداران عمده را در یک بستر امن به هم متصل می‌کند.') +
    P('ما با احراز هویت چندلایه، پرداخت امانی، مذاکره ساختاریافته و ابزارهای لجستیک، ریسک معاملات فرامرزی را به حداقل می‌رسانیم.') +
    '<h3>ماموریت ما</h3>' + P('حذف واسطه‌های غیرضروری و ایجاد شفافیت قیمت در زنجیره تأمین بین‌المللی.') +
    '<h3>در یک نگاه</h3><ul><li>پشتیبانی از تجارت B2B، B2C، C2C و خدمات</li><li>چهار زبان و شش ارز</li><li>پرداخت امانی و مدیریت اختلاف</li><li>احراز هویت اشخاص حقیقی و حقوقی</li></ul>',
    '<h3>Our mission</h3>' + P('MYDAN connects verified manufacturers, distributors and wholesale buyers on one secure cross-border trading platform.')],
  ['terms', 'قوانین و مقررات', 'Terms of Service',
    '<h3>۱. پذیرش شرایط</h3>' + P('استفاده از پلتفرم مایدان به منزله پذیرش کامل این قوانین است.') +
    '<h3>۲. حساب کاربری</h3>' + P('کاربر مسئول صحت اطلاعات ثبت‌شده و حفظ امنیت دسترسی حساب خود است. ارائه مدارک جعلی موجب مسدودی دائم می‌شود.') +
    '<h3>۳. کالاها و آگهی‌ها</h3>' + P('انتشار کالاهای غیرقانونی، تقلبی یا مشمول تحریم ممنوع است. تمام آگهی‌ها پیش از انتشار بازبینی می‌شوند.') +
    '<h3>۴. معاملات و پرداخت</h3>' + P('پلتفرم بستر معامله را فراهم می‌کند؛ قرارداد اصلی میان خریدار و فروشنده منعقد می‌شود. در پرداخت امانی وجه تا تأیید تحویل نگهداری می‌شود.') +
    '<h3>۵. کارمزد</h3>' + P('کارمزد پلتفرم بر اساس تعرفه اعلامی در صفحه عضویت محاسبه می‌شود.') +
    '<h3>۶. اختلافات</h3>' + P('در صورت بروز اختلاف، پرونده در واحد داوری مایدان بررسی و ظرف حداکثر ۱۴ روز کاری تعیین تکلیف می‌شود.') +
    '<h3>۷. تغییر شرایط</h3>' + P('مایدان می‌تواند این شرایط را به‌روزرسانی کند و تغییرات از تاریخ انتشار لازم‌الاجرا است.'),
    P('By using MYDAN you accept these terms in full.')],
  ['privacy', 'سیاست حریم خصوصی', 'Privacy Policy',
    '<h3>داده‌هایی که جمع‌آوری می‌کنیم</h3>' + P('اطلاعات هویتی، اطلاعات کسب‌وکار، مدارک احراز هویت، داده‌های تراکنش و داده‌های فنی مانند IP و نوع دستگاه.') +
    '<h3>مبنای قانونی</h3>' + P('پردازش داده بر اساس اجرای قرارداد، رضایت صریح شما و منافع مشروع در پیشگیری از تقلب انجام می‌شود (منطبق با GDPR و KVKK).') +
    '<h3>حقوق شما</h3><ul><li>دسترسی و دریافت نسخه‌ای از داده‌ها</li><li>اصلاح داده‌های نادرست</li><li>حذف حساب و داده‌ها</li><li>محدودسازی یا اعتراض به پردازش</li><li>قابلیت انتقال داده</li></ul>' +
    P('این حقوق از مسیر «حساب کاربری ← حریم خصوصی» قابل اعمال است.') +
    '<h3>نگهداری داده</h3>' + P('مدارک احراز هویت تا ۵ سال پس از پایان رابطه تجاری بر اساس الزامات مبارزه با پول‌شویی نگهداری می‌شود.'),
    P('We process personal data under GDPR/KVKK. You may access, correct, export or delete your data from the Privacy Center.')],
  ['escrow', 'پرداخت امن (اسکرو)', 'Escrow Payment',
    '<h3>پرداخت امانی چگونه کار می‌کند؟</h3><ol><li>خریدار وجه را به حساب امانی مایدان واریز می‌کند.</li><li>فروشنده پس از تأیید واریز، کالا را ارسال می‌کند.</li><li>خریدار کالا را دریافت و بازرسی می‌کند.</li><li>پس از تأیید خریدار یا اتمام مهلت بازرسی، وجه به فروشنده آزاد می‌شود.</li></ol>' +
    P('در صورت مغایرت، خریدار می‌تواند ظرف مهلت بازرسی درخواست اختلاف ثبت کند.'),
    P('Funds are held by MYDAN until the buyer confirms delivery.')],
  ['fees', 'کارمزد و تعرفه‌ها', 'Fees & Pricing',
    '<h3>کارمزد معاملات</h3>' + P('۳٪ از ارزش سفارش‌های تکمیل‌شده، تنها از فروشنده و تنها در صورت موفقیت معامله.') +
    '<h3>عضویت</h3>' + P('چهار سطح عضویت با امکانات متفاوت؛ جزئیات در صفحه عضویت.') +
    '<h3>ارتقا و تبلیغات</h3>' + P('نردبان از ۹۹ لیر و بنرهای تبلیغاتی بر اساس جایگاه و مدت.'),
    P('3% success fee on completed orders. Membership and promotion priced separately.')],
  ['shipping', 'راهنمای حمل و لجستیک', 'Shipping & Logistics',
    '<h3>اینکوترمزهای پشتیبانی‌شده</h3>' + P('EXW، FCA، FOB، CFR، CIF، CPT، CIP، DAP، DPU، DDP') +
    '<h3>مدارک حمل</h3><ul><li>پروفرما اینویس</li><li>پکینگ لیست</li><li>بارنامه (B/L یا CMR)</li><li>گواهی مبدأ</li><li>گواهی بازرسی و بهداشت</li></ul>',
    P('MYDAN supports all major Incoterms 2020 rules.')],
  ['trust-safety', 'اعتماد و امنیت', 'Trust & Safety',
    '<h3>لایه‌های اعتماد</h3><ul><li>احراز هویت حقیقی و حقوقی</li><li>امتیاز اعتماد پویا بر اساس عملکرد</li><li>بازبینی انسانی آگهی‌ها</li><li>پرداخت امانی و داوری اختلاف</li><li>گزارش تخلف در تمام صفحات</li></ul>' +
    '<h3>هشدارهای کلاهبرداری</h3>' + P('هرگز خارج از پلتفرم و بدون قرارداد وجه واریز نکنید. قیمت‌های غیرواقعی و فشار برای پرداخت فوری نشانه ریسک است.'),
    P('Multi-layer verification, escrow, moderation and dispute arbitration.')],
  ['careers', 'فرصت‌های شغلی', 'Careers',
    P('ما در حال ساخت زیرساخت تجارت فرامرزی هستیم و به دنبال هم‌تیمی‌های کنجکاو می‌گردیم.') +
    '<ul><li>مهندس نرم‌افزار ارشد (Node.js)</li><li>کارشناس رشد بازار صادراتی</li><li>کارشناس احراز هویت و انطباق</li><li>طراح محصول</li></ul>' + P('رزومه: careers@mydan.market'),
    P('We are hiring across engineering, growth and compliance.')],
];
PAGES.forEach(([slug, tfa, ten, bfa, ben]) => up(
  `INSERT INTO pages (slug,title_fa,title_en,title_tr,title_ar,body_fa,body_en,body_tr,body_ar,seo_title,seo_description,status,updated_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?, 'published', datetime('now'))
   ON CONFLICT(slug) DO UPDATE SET title_fa=excluded.title_fa,body_fa=excluded.body_fa,body_en=excluded.body_en,updated_at=datetime('now')`,
  [slug, tfa, ten, ten, tfa, bfa, ben, ben, bfa, `${tfa} | MYDAN`, String(bfa).replace(/<[^>]+>/g, ' ').slice(0, 155)]));

const FAQS = [
  ['حساب کاربری', 'چگونه ثبت‌نام کنم؟', 'با شماره موبایل خود وارد شوید؛ کد یکبار مصرف برایتان ارسال می‌شود و بدون نیاز به رمز عبور حساب ساخته می‌شود.', 'How do I register?', 'Enter your mobile number and confirm the one-time code. No password required.'],
  ['حساب کاربری', 'آیا می‌توانم هم خریدار و هم فروشنده باشم؟', 'بله. با یک حساب می‌توانید بین حالت خریدار و فروشنده جابه‌جا شوید.', 'Can I be both buyer and seller?', 'Yes, one account supports both modes.'],
  ['حساب کاربری', 'چطور حسابم را حذف کنم؟', 'از مسیر حساب کاربری ← حریم خصوصی ← حذف حساب. داده‌های مالی طبق الزامات قانونی نگهداری می‌شود.', 'How do I delete my account?', 'Account → Privacy → Delete account.'],
  ['احراز هویت', 'احراز هویت چقدر طول می‌کشد؟', 'معمولاً کمتر از ۲۴ ساعت کاری.', 'How long does verification take?', 'Usually under 24 business hours.'],
  ['احراز هویت', 'چه مدارکی برای شرکت لازم است؟', 'گواهی ثبت شرکت، شناسه مالیاتی، آگهی روزنامه رسمی و مدرک هویتی شخص مجاز.', 'What documents are required for a company?', 'Registration certificate, tax ID, official gazette and the authorized person ID.'],
  ['آگهی و کالا', 'چرا آگهی من رد شد؟', 'دلیل دقیق در صفحه مدیریت کالا نمایش داده می‌شود؛ رایج‌ترین دلایل تصویر نامرتبط، اطلاعات ناقص یا قیمت غیرواقعی است.', 'Why was my listing rejected?', 'The exact reason is shown in your product management page.'],
  ['آگهی و کالا', 'نردبان چه تفاوتی با آگهی ویژه دارد؟', 'نردبان آگهی را به ابتدای لیست دسته می‌برد؛ آگهی ویژه علاوه بر آن در صفحه اول و نتایج جستجو با نشان طلایی نمایش داده می‌شود.', 'Ladder vs featured?', 'Ladder lifts you in category listings; featured also appears on the homepage.'],
  ['پرداخت', 'پرداخت امانی چیست؟', 'وجه نزد مایدان نگهداری و پس از تأیید دریافت کالا به فروشنده آزاد می‌شود.', 'What is escrow?', 'Funds are held by MYDAN and released after the buyer confirms delivery.'],
  ['پرداخت', 'کارمزد چقدر است؟', '۳٪ ارزش سفارش تکمیل‌شده، تنها از فروشنده.', 'What is the fee?', '3% of completed order value, seller side only.'],
  ['پرداخت', 'امکان استرداد وجود دارد؟', 'بله، در صورت عدم ارسال یا مغایرت اثبات‌شده، وجه به خریدار بازگردانده می‌شود.', 'Are refunds possible?', 'Yes, for non-delivery or proven non-conformity.'],
  ['درخواست خرید', 'درخواست خرید چیست؟', 'اعلام نیاز خرید شما که تأمین‌کنندگان مرتبط برای آن پیش‌فاکتور ارسال می‌کنند.', 'What is a buy request?', 'An RFQ that matched suppliers can quote on.'],
  ['درخواست خرید', 'چند پیشنهاد دریافت می‌کنم؟', 'بستگی به دسته و شفافیت درخواست دارد؛ به‌طور میانگین بین ۳ تا ۱۲ پیشنهاد.', 'How many quotes will I get?', 'Typically between 3 and 12.'],
];
FAQS.forEach(([g, qfa, afa, qen, aen], i) => {
  if (!q.get('SELECT 1 x FROM faqs WHERE q_fa=?', [qfa]))
    up('INSERT INTO faqs (group_name,q_fa,a_fa,q_en,a_en,sort_order) VALUES (?,?,?,?,?,?)', [g, qfa, afa, qen, aen, i]);
});

const POSTS = [
  ['export-saffron-guide', 'راهنمای کامل صادرات زعفران در سال ۲۰۲۶',
    'از استانداردهای ISO 3632 تا بسته‌بندی، گواهی مبدأ و مقررات گمرکی بازارهای هدف.',
    P('زعفران یکی از پرارزش‌ترین کالاهای صادراتی منطقه است، اما موفقیت در صادرات آن بیش از کیفیت محصول به رعایت استانداردها بستگی دارد.') +
    '<h3>۱. استاندارد ISO 3632</h3>' + P('شاخص‌های کروسین، پیکروکروسین و سافرانال تعیین‌کننده گرید محصول هستند. گرید I برای بازارهای اروپایی الزامی است.') +
    '<h3>۲. بسته‌بندی</h3>' + P('بسته‌بندی باید مانع نفوذ نور و رطوبت باشد؛ ظروف شیشه‌ای تیره یا فویل آلومینیومی با درزبندی حرارتی توصیه می‌شود.') +
    '<h3>۳. مدارک</h3>' + P('گواهی مبدأ، گواهی بهداشت، آنالیز آزمایشگاهی معتبر و پکینگ لیست دقیق.') +
    '<h3>۴. اشتباهات رایج</h3><ul><li>ارسال نمونه بدون قرارداد نمونه</li><li>عدم تطابق شماره بچ با آنالیز</li><li>قیمت‌گذاری بدون احتساب هزینه سرد‌خانه</li></ul>'],
  ['incoterms-2020', 'اینکوترمز ۲۰۲۰ به زبان ساده',
    'کدام اینکوترم برای اولین معامله صادراتی شما مناسب‌تر است؟',
    P('اینکوترمز مجموعه قواعدی است که مشخص می‌کند مسئولیت هزینه، ریسک و ترخیص در چه نقطه‌ای از خریدار به فروشنده منتقل می‌شود.') +
    '<h3>گروه E و F</h3>' + P('EXW کمترین مسئولیت را برای فروشنده دارد؛ FOB برای حمل دریایی رایج‌ترین انتخاب است.') +
    '<h3>گروه C</h3>' + P('در CIF فروشنده کرایه و بیمه را می‌پردازد اما ریسک از بندر مبدأ منتقل می‌شود — این تفکیک منبع بیشترین سوءتفاهم‌هاست.') +
    '<h3>گروه D</h3>' + P('DDP بیشترین مسئولیت را بر عهده فروشنده می‌گذارد و برای تازه‌واردها توصیه نمی‌شود.')],
  ['rfq-best-practices', 'چگونه یک درخواست خرید بنویسیم که پاسخ بگیرد',
    'هفت عنصری که نرخ پاسخ RFQ شما را چند برابر می‌کند.',
    P('درخواست‌های خرید مبهم معمولاً بی‌پاسخ می‌مانند. تأمین‌کننده حرفه‌ای برای قیمت‌دهی به داده نیاز دارد.') +
    '<ul><li>مشخصات فنی دقیق و تلورانس مجاز</li><li>حجم سفارش و امکان تکرار</li><li>مقصد تحویل و اینکوترم مورد نظر</li><li>شرایط پرداخت پیشنهادی</li><li>گواهی‌های الزامی</li><li>بازه زمانی تحویل</li><li>تصویر یا نقشه مرجع</li></ul>' +
    P('تجربه پلتفرم نشان می‌دهد درخواست‌های دارای فایل پیوست حدود دو برابر بیشتر پیشنهاد دریافت می‌کنند.')],
  ['trust-signals', 'شش سیگنال اعتماد که خریداران عمده به آن نگاه می‌کنند',
    'چرا برخی غرفه‌ها ده برابر بیشتر درخواست دریافت می‌کنند؟',
    P('خریدار عمده پیش از تماس، پروفایل شما را ارزیابی می‌کند.') +
    '<ol><li>نشان احراز هویت شرکتی</li><li>تصاویر واقعی خط تولید</li><li>شفافیت MOQ و شرایط پرداخت</li><li>سرعت پاسخ‌گویی زیر یک ساعت</li><li>نظرات ثبت‌شده معاملات قبلی</li><li>کاتالوگ PDF قابل دانلود</li></ol>'],
  ['cross-border-payment', 'روش‌های پرداخت در تجارت فرامرزی',
    'مقایسه LC، TT، اسکرو و پرداخت مرحله‌ای از نظر ریسک و هزینه.',
    P('انتخاب روش پرداخت مهم‌ترین تصمیم مدیریت ریسک در یک معامله بین‌المللی است.') +
    '<h3>اعتبار اسنادی (LC)</h3>' + P('امن اما پرهزینه و کند؛ مناسب معاملات بزرگ.') +
    '<h3>حواله (TT)</h3>' + P('سریع و ارزان اما ریسک را کاملاً به یک طرف منتقل می‌کند.') +
    '<h3>اسکرو</h3>' + P('تعادل مناسب برای معاملات متوسط؛ در مایدان به صورت داخلی پشتیبانی می‌شود.')],
];
const BLOG_COVERS = {
  'rfq-best-practices': '/img/blog/rfq.jpg',
  'trust-signals': '/img/blog/trust.jpg',
  'cross-border-payment': '/img/blog/payment.jpg',
  'export-saffron-guide': '/img/blog/saffron-export.jpg',
  'incoterms-2020': '/img/blog/incoterms.jpg',
};
POSTS.forEach(([slug, title, ex, body]) => {
  const tr = BLOG_TITLES[title] || {};
  up(`INSERT INTO blog_posts (slug,title,excerpt,body,status,cover,
        title_fa,title_en,excerpt_fa,excerpt_en)
      VALUES (?,?,?,?,'published',?,?,?,?,?)
      ON CONFLICT(slug) DO UPDATE SET title=excluded.title, excerpt=excluded.excerpt,
        body=excluded.body, cover=excluded.cover,
        title_fa=excluded.title_fa, title_en=excluded.title_en,
        excerpt_fa=excluded.excerpt_fa, excerpt_en=excluded.excerpt_en`,
    [slug, title, ex, body, BLOG_COVERS[slug] || null,
     (tr.fa||{}).title || null, (tr.en||{}).title || null,
     (tr.fa||{}).excerpt || null, (tr.en||{}).excerpt || null]);
});

/* ---------------- users ---------------- */
function ensureUser(o) {
  let u = q.get('SELECT * FROM users WHERE phone=?', [o.phone]);
  if (!u) {
    up(`INSERT INTO users (uuid,phone,email,password_hash,display_name,locale,currency,theme,active_mode,is_admin,admin_role,phone_verified,email_verified,status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,1,1,'active')`,
      [uuid(), o.phone, o.email, bcrypt.hashSync(o.password || 'Mydan!2026', 10), o.name,
       o.locale || 'fa', o.currency || 'TRY', 'luxury', o.mode || 'buyer', o.is_admin ? 1 : 0, o.admin_role || null]);
    u = q.get('SELECT * FROM users WHERE phone=?', [o.phone]);
  }
  if (!q.get('SELECT 1 x FROM profiles WHERE user_id=?', [u.id]))
    up('INSERT INTO profiles (user_id) VALUES (?)', [u.id]);
  up(`UPDATE profiles SET business_name=?, about=?, country=?, city=?, seller_type=?, industry=?,
        registration_no=?, tax_no=?, website=?, incoterms=?, export_markets=?, phone_public=?, category_id=?,
        response_rate=?, response_time_min=?
      WHERE user_id=?`,
    [o.business || null, o.about || null, o.country || 'TR', o.city || 'Istanbul', o.seller_type || null,
     o.industry || null, o.reg || null, o.tax || null, o.website || null, o.incoterms || 'FOB,CIF,EXW',
     o.markets || null, o.phone_public ? 1 : 0, o.cat ? catId(o.cat) : null, rnd(70, 99), rnd(15, 240), u.id]);
  if (!q.get('SELECT 1 x FROM wallets WHERE user_id=?', [u.id]))
    up('INSERT INTO wallets (user_id,balance_minor,currency) VALUES (?,?,?)', [u.id, 0, 'TRY']);
  return q.get('SELECT * FROM users WHERE id=?', [u.id]);
}

const admin = ensureUser({ phone: '+905000000001', email: 'admin@mydan.market', name: 'مدیر سامانه',
  is_admin: 1, admin_role: 'super_admin', business: 'MYDAN Operations', country: 'TR', city: 'Istanbul',
  about: 'تیم عملیات پلتفرم مایدان.' });

const SELLERS = [
  { phone: '+905000000010', email: 'zarrin@mydan.market', name: 'رضا کاویانی', business: 'شرکت زرین زعفران خراسان',
    seller_type: 'manufacturer', cat: 'saffron-spice', country: 'IR', city: 'Mashhad', industry: 'زعفران و ادویه',
    about: 'تولیدکننده و صادرکننده زعفران سرگل و نگین با گرید ISO 3632 Class I. دارای خط بسته‌بندی اتوماتیک و آزمایشگاه کنترل کیفیت داخلی. صادرات به ۱۹ کشور.',
    reg: 'IR-1042887', tax: '411556923', website: 'https://zarrinsaffron.example', markets: 'DE,AE,ES,IT,CN', phone_public: 1 },
  { phone: '+905000000011', email: 'anatolia@mydan.market', name: 'Mehmet Yılmaz', business: 'Anatolia Textile Group',
    seller_type: 'manufacturer', cat: 'fabric', country: 'TR', city: 'Bursa', industry: 'Textile', locale: 'tr',
    about: 'Integrated weaving and finishing mill in Bursa. Monthly capacity 1.2M meters. OEKO-TEX and GOTS certified.',
    reg: 'TR-556219', tax: '5562190011', website: 'https://anatoliatextile.example', markets: 'DE,NL,GB,IT,US' },
  { phone: '+905000000012', email: 'gulf@mydan.market', name: 'Khalid Al-Mansouri', business: 'Gulf Polymer Trading LLC',
    seller_type: 'distributor', cat: 'polymer', country: 'AE', city: 'Dubai', industry: 'Petrochemicals', locale: 'ar',
    about: 'شركة توزيع مواد البوليمر في جبل علي. مخزون دائم من البولي إيثيلين والبولي بروبيلين.',
    reg: 'AE-889231', tax: '100388923100003', markets: 'IQ,SA,OM,QA,IN' },
  { phone: '+905000000013', email: 'stonehouse@mydan.market', name: 'علی صادقی', business: 'صنایع سنگ آریا',
    seller_type: 'manufacturer', cat: 'stone', country: 'IR', city: 'Isfahan', industry: 'مصالح ساختمانی',
    about: 'استخراج و فرآوری مرمریت، تراورسین و اونیکس. سه معدن اختصاصی و کارخانه فرآوری با ظرفیت ۴۰۰ هزار متر مربع در سال.',
    reg: 'IR-778120', tax: '778120445', markets: 'TR,IQ,RU,CN' },
  { phone: '+905000000014', email: 'novamachine@mydan.market', name: 'Deniz Kaya', business: 'Nova Food Machinery',
    seller_type: 'manufacturer', cat: 'food-machinery', country: 'TR', city: 'Izmir', industry: 'Machinery', locale: 'tr',
    about: 'Turnkey food processing lines: dryers, sorters, filling and packaging machines. CE certified, 24-month warranty.',
    reg: 'TR-334981', tax: '3349810022', markets: 'IR,IQ,AZ,RU,DE' },
  { phone: '+905000000015', email: 'persiancarpet@mydan.market', name: 'حسین رضوانی', business: 'فرش دستباف رضوانی',
    seller_type: 'exporter', cat: 'carpet', country: 'IR', city: 'Tabriz', industry: 'صنایع دستی',
    about: 'صادرکننده فرش دستباف تبریز با بیش از ۴۰ سال سابقه. رج‌شمار ۴۰ تا ۷۰، طرح‌های اصیل و سفارشی.',
    reg: 'IR-220145', tax: '220145889', markets: 'DE,IT,US,AE', phone_public: 1 },
  { phone: '+905000000016', email: 'solarline@mydan.market', name: 'Chen Wei', business: 'SolarLine Energy Co.',
    seller_type: 'manufacturer', cat: 'solar', country: 'CN', city: 'Ningbo', industry: 'Renewable Energy', locale: 'en',
    about: 'Tier-1 monocrystalline PV module manufacturer. 3.5 GW annual capacity, TUV and IEC certified, 25-year performance warranty.',
    reg: 'CN-91330200', tax: '91330200MA2', markets: 'TR,AE,IR,PK,DE' },
  { phone: '+905000000017', email: 'bosphorus@mydan.market', name: 'Ayşe Demir', business: 'Bosphorus Freight & Customs',
    seller_type: 'service', cat: 'freight', country: 'TR', city: 'Istanbul', industry: 'Logistics', locale: 'tr',
    about: 'Full-service freight forwarder: sea, road and rail between Türkiye, Iran, Iraq and the EU. Bonded warehouse in Halkalı.',
    reg: 'TR-119045', tax: '1190450033', markets: 'IR,IQ,DE,NL', phone_public: 1 },
  { phone: '+905000000018', email: 'greenfields@mydan.market', name: 'محمد امینی', business: 'گرین‌فیلدز خشکبار',
    seller_type: 'wholesaler', cat: 'nuts', country: 'IR', city: 'Tehran', industry: 'خشکبار',
    about: 'عمده‌فروشی پسته، بادام، کشمش و انجیر خشک. سورت لیزری و بسته‌بندی وکیوم صادراتی.',
    reg: 'IR-556003', tax: '556003221', markets: 'TR,DE,RU,IN' },
  { phone: '+905000000019', email: 'medipack@mydan.market', name: 'Elif Şahin', business: 'MediPack Disposables',
    seller_type: 'manufacturer', cat: 'disposables', country: 'TR', city: 'Ankara', industry: 'Medical', locale: 'tr',
    about: 'Manufacturer of sterile medical disposables. ISO 13485 and CE MDR certified. Export to 24 countries.',
    reg: 'TR-902341', tax: '9023410044', markets: 'IQ,SA,AE,DE' },
];
const sellers = SELLERS.map((s) => ensureUser({ ...s, mode: 'seller' }));

const BUYERS = [
  { phone: '+905000000030', email: 'atlas@mydan.market', name: 'Jan Bakker', business: 'Atlas Import BV',
    country: 'NL', city: 'Rotterdam', industry: 'Food Import', locale: 'en',
    about: 'European importer of specialty food ingredients, sourcing for retail chains in Benelux.' },
  { phone: '+905000000031', email: 'baghdad@mydan.market', name: 'أحمد الجبوري', business: 'Baghdad Construction Supply',
    country: 'IQ', city: 'Baghdad', industry: 'Construction', locale: 'ar',
    about: 'مورد مواد البناء لمشاريع كبرى في العراق.' },
  { phone: '+905000000032', email: 'sara@mydan.market', name: 'سارا نیک‌پور', business: 'بازرگانی نیک‌پور',
    country: 'IR', city: 'Tehran', industry: 'بازرگانی عمومی',
    about: 'واردات ماشین‌آلات و مواد اولیه صنعتی.' },
  { phone: '+905000000033', email: 'kaan@mydan.market', name: 'Kaan Öztürk', business: 'Öztürk Perakende',
    country: 'TR', city: 'Istanbul', industry: 'Retail', locale: 'tr',
    about: 'Retail chain buyer for home textile and housewares.' },
  { phone: '+905000000034', email: 'lena@mydan.market', name: 'Lena Fischer', business: 'Fischer Handel GmbH',
    country: 'DE', city: 'Hamburg', industry: 'Wholesale', locale: 'en',
    about: 'German wholesaler for carpets, ceramics and handicraft.' },
];
const buyers = BUYERS.map((b) => ensureUser({ ...b, mode: 'buyer' }));

/* KYC approved for sellers */
[...sellers, ...buyers].forEach((u, i) => {
  const kind = i < sellers.length ? 'kyb' : 'kyc';
  if (!q.get('SELECT 1 x FROM kyc_cases WHERE user_id=?', [u.id])) {
    const status = i % 7 === 3 ? 'pending_review' : 'approved';
    up(`INSERT INTO kyc_cases (user_id,kind,status,legal_name,national_id,country,company_name,company_reg_no,
          authorized_person,submitted_at,decided_at,reviewer_id,review_note)
        VALUES (?,?,?,?,?,?,?,?,?,datetime('now','-20 days'),?,?,?)`,
      [u.id, kind, status, u.display_name, String(rnd(1000000000, 9999999999)),
       (q.get('SELECT country FROM profiles WHERE user_id=?', [u.id]) || {}).country || 'TR',
       (q.get('SELECT business_name FROM profiles WHERE user_id=?', [u.id]) || {}).business_name || null,
       (q.get('SELECT registration_no FROM profiles WHERE user_id=?', [u.id]) || {}).registration_no || null,
       u.display_name,
       status === 'approved' ? new Date(Date.now() - 19 * 864e5).toISOString().slice(0, 19).replace('T', ' ') : null,
       status === 'approved' ? admin.id : null,
       status === 'approved' ? 'مدارک کامل و مطابق با اصل.' : 'در نوبت بررسی کارشناس.']);
    const cid = q.get('SELECT id FROM kyc_cases WHERE user_id=? ORDER BY id DESC LIMIT 1', [u.id]).id;
    up('INSERT INTO kyc_events (case_id,actor_id,from_status,to_status,note) VALUES (?,?,?,?,?)', [cid, u.id, null, 'pending_review', 'ارسال اولیه مدارک']);
    if (status === 'approved') up('INSERT INTO kyc_events (case_id,actor_id,from_status,to_status,note) VALUES (?,?,?,?,?)', [cid, admin.id, 'pending_review', 'approved', 'مدارک کامل و معتبر']);
  }
  H.trustScore(u.id);
  try { H.computeCompletion(u.id); } catch (_) {}
});

/* seller subscriptions */
sellers.slice(0, 6).forEach((s, i) => {
  const code = ['gold', 'silver', 'platinum', 'silver', 'gold', 'free'][i];
  const plan = q.get('SELECT * FROM plans WHERE code=?', [code]);
  if (!q.get('SELECT 1 x FROM subscriptions WHERE user_id=?', [s.id])) {
    up(`INSERT INTO subscriptions (user_id,plan_id,status,starts_at,ends_at,auto_renew)
        VALUES (?,?,'active',datetime('now','-30 days'),datetime('now','+' || ? || ' days'),1)`,
      [s.id, plan.id, (plan.months || 1) * 30]);
    q.all('SELECT * FROM plan_features WHERE plan_id=?', [plan.id]).forEach((f) => up(
      `INSERT INTO entitlements (user_id,ekey,value,expires_at) VALUES (?,?,?,datetime('now','+' || ? || ' days'))
       ON CONFLICT(user_id,ekey) DO UPDATE SET value=excluded.value, expires_at=excluded.expires_at`,
      [s.id, f.fkey, f.value, (plan.months || 1) * 30]));
  }
});

/* ---------------- listings ---------------- */
const LISTINGS = [
  { s: 0, cat: 'saffron-spice', title: 'زعفران سرگل ممتاز صادراتی — گرید I ایزو ۳۶۳۲', type: 'export',
    unit: 'kg', inv: 850, moq: 5, price: 42000, cur: 'TRY', origin: ['IR', 'خراسان رضوی', 'Mashhad'], lead: 7,
    desc: 'زعفران سرگل خالص برداشت پاییز، کاملاً بدون خامه، خشک‌شده در تونل کنترل‌شده و بسته‌بندی در اتاق تمیز. هر بچ دارای آنالیز مستقل آزمایشگاه معتمد است.',
    quality: 'کروسین بالای ۲۴۰، سافرانال ۲۵ تا ۳۵، پیکروکروسین بالای ۸۵', packaging: 'ظرف شیشه‌ای تیره ۱۰ و ۵۰ گرمی، فویل آلومینیوم یک کیلویی، کارتن ۵ کیلویی',
    cert: 'ISO 3632-1 Class I, HACCP, ISO 22000, Organic EU', pay: 'LC at sight, TT 30% advance, Escrow',
    del: 'FOB Bandar Abbas / CIF Hamburg / EXW Mashhad', attrs: { grade: 'A+', purity: '99.5', iso_grade: 'I', type: 'سرگل' } },
  { s: 0, cat: 'saffron-spice', title: 'زعفران نگین درجه یک — بسته‌بندی سفارشی برند خریدار', type: 'wholesale',
    unit: 'kg', inv: 320, moq: 2, price: 46500, cur: 'TRY', origin: ['IR', 'خراسان رضوی', 'Torbat'], lead: 10,
    desc: 'زعفران نگین با رشته‌های بلند و یکدست، مناسب برندهای لوکس. امکان چاپ برچسب و بسته‌بندی اختصاصی خریدار (Private Label) از ۵۰ کیلوگرم.',
    quality: 'رشته بلند، بدون شکستگی، رنگ یکنواخت', packaging: 'Private label، ظرف کریستالی، جعبه هدیه',
    cert: 'ISO 3632-1 Class I, HALAL', pay: 'TT، اسکرو', del: 'CIF, DDP', attrs: { grade: 'A+', type: 'نگین', purity: '99.8' } },
  { s: 1, cat: 'fabric', title: 'Cotton Poplin Fabric 120 GSM — Reactive Dyed', type: 'wholesale',
    unit: 'm', inv: 145000, moq: 3000, price: 84, cur: 'TRY', origin: ['TR', 'Bursa', 'Bursa'], lead: 21,
    desc: 'Premium combed cotton poplin woven and finished in our integrated Bursa mill. Reactive dyeing with excellent color fastness, suitable for shirting and uniform production. Over 60 stock colors, custom Pantone matching from 3,000 meters.',
    quality: '100% combed cotton, 4-5 rubbing fastness, pre-shrunk under 2%', packaging: 'Rolls of 100m on cardboard tube, PE wrapped, 12 rolls per pallet',
    cert: 'OEKO-TEX Standard 100, GOTS, ISO 9001', pay: 'LC, TT 40/60, Escrow', del: 'FOB Istanbul, CIF Rotterdam, EXW Bursa',
    attrs: { composition: '100% Cotton', gsm: '120', width_cm: '150', color_fastness: '4-5' } },
  { s: 1, cat: 'home-textile', title: 'Hotel Collection Bath Towel Set — 600 GSM Turkish Cotton', type: 'wholesale',
    unit: 'pcs', inv: 42000, moq: 500, price: 195, cur: 'TRY', origin: ['TR', 'Bursa', 'Bursa'], lead: 18,
    desc: 'Double-yarn 600 GSM Turkish cotton towels for hospitality. Long-staple Aegean cotton, industrial-wash tested to 200 cycles with minimal pile loss. Custom jacquard border and embroidery available.',
    quality: 'Zero-twist, 600 GSM, 200-cycle industrial wash tested', packaging: 'Polybag per piece, 20 pcs per carton',
    cert: 'OEKO-TEX Standard 100', pay: 'TT 30% advance, Escrow', del: 'FOB Istanbul, DAP EU' },
  { s: 2, cat: 'polymer', title: 'HDPE Injection Grade Granules — 5502 Series', type: 'wholesale',
    unit: 'ton', inv: 1800, moq: 20, price: 41500, cur: 'TRY', origin: ['AE', 'Dubai', 'Jebel Ali'], lead: 14,
    desc: 'High density polyethylene injection moulding grade in 25 kg PP bags. Consistent MFI, stable supply from Jebel Ali bonded stock with monthly allocation contracts available.',
    quality: 'MFI 5.5 g/10min, density 0.955 g/cm3', packaging: '25 kg PP bag, 40 bags per pallet, 20 MT per 40ft container',
    cert: 'FDA food contact, REACH', pay: 'LC 90 days, TT', del: 'FOB Jebel Ali, CFR Umm Qasr, CIF Bandar Abbas',
    attrs: { grade_code: 'HD5502', mfi: '5.5', application: 'تزریقی' } },
  { s: 3, cat: 'stone', title: 'مرمریت کرم دهبید — اسلب پولیش‌شده ۲ سانتی', type: 'export',
    unit: 'm2', inv: 12500, moq: 200, price: 1450, cur: 'TRY', origin: ['IR', 'فارس', 'Dehbid'], lead: 25,
    desc: 'اسلب مرمریت کرم دهبید با رگه‌های یکنواخت و جذب آب پایین، مناسب نمای داخلی، کف و پله پروژه‌های لوکس. برش با دستگاه چندتیغه ایتالیایی و پولیش ۱۲ کله.',
    quality: 'جذب آب زیر ۰٫۴٪، مقاومت فشاری بالای ۹۰ مگاپاسکال', packaging: 'باندل چوبی با فوم محافظ، ۲۰ اسلب در هر باندل',
    cert: 'CE Marking, ISO 9001', pay: 'TT 50% پیش‌پرداخت، اسکرو', del: 'EXW Isfahan, FOB Bandar Abbas',
    attrs: { stone_type: 'مرمریت', finish: 'پولیش', thickness_mm: '20' } },
  { s: 3, cat: 'stone', title: 'تراورتن سیلور موج‌دار — تایل ۶۰×۳۰', type: 'wholesale',
    unit: 'm2', inv: 30000, moq: 500, price: 690, cur: 'TRY', origin: ['IR', 'مرکزی', 'Mahallat'], lead: 20,
    desc: 'تراورتن سیلور با موج یکنواخت و کالیبراسیون دقیق ضخامت، مناسب نمای بیرونی و کف محوطه. امکان تولید در ابعاد سفارشی.',
    quality: 'کالیبره ±۰٫۵ میلی‌متر', packaging: 'کارتن + پالت چوبی', cert: 'CE Marking',
    pay: 'TT، اسکرو', del: 'EXW, FOB', attrs: { stone_type: 'تراورتن', finish: 'هونیت', thickness_mm: '15' } },
  { s: 4, cat: 'food-machinery', title: 'Industrial Belt Dryer — 500 kg/h Continuous Line', type: 'wholesale',
    unit: 'pcs', inv: 6, moq: 1, price: 2450000, cur: 'TRY', origin: ['TR', 'Izmir', 'Izmir'], lead: 60,
    desc: 'Continuous multi-belt dryer for fruits, vegetables and herbs. Five independently controlled temperature zones, stainless AISI 304 contact surfaces, PLC control with recipe memory and remote diagnostics.',
    quality: 'AISI 304 food-grade stainless, 5 heat zones, PLC + HMI', packaging: 'Sea-worthy wooden crate, 2x40ft HC',
    cert: 'CE, ISO 9001', pay: 'TT 40% advance / 60% before shipment, LC', del: 'FOB Izmir, CIF Bandar Abbas, DAP',
    attrs: { capacity: '500', power_kw: '186', warranty_months: '24', automation: 'تمام‌اتوماتیک' } },
  { s: 4, cat: 'packaging-machinery', title: 'Automatic Vacuum Packaging Machine — Double Chamber', type: 'wholesale',
    unit: 'pcs', inv: 18, moq: 1, price: 385000, cur: 'TRY', origin: ['TR', 'Izmir', 'Izmir'], lead: 30,
    desc: 'Double chamber vacuum sealer for nuts, dried fruits, meat and cheese. Busch vacuum pump, gas flush option, programmable 20-recipe memory.',
    quality: 'Busch 63 m3/h pump, 2x600mm seal bars', packaging: 'Wooden crate', cert: 'CE',
    pay: 'TT, Escrow', del: 'FOB Izmir, EXW', attrs: { capacity: '400', power_kw: '3.5', warranty_months: '24', automation: 'تمام‌اتوماتیک' } },
  { s: 5, cat: 'carpet', title: 'فرش دستباف تبریز ۵۰ رج — طرح ماهی درهم، ۳×۴ متر', type: 'export',
    unit: 'pcs', inv: 14, moq: 1, price: 245000, cur: 'TRY', origin: ['IR', 'آذربایجان شرقی', 'Tabriz'], lead: 5,
    desc: 'فرش دستباف تبریز با رج‌شمار ۵۰، پرز پشم کرک و تار ابریشم. رنگرزی گیاهی با ثبات بالا. دارای شناسنامه و گواهی اصالت مرکز ملی فرش.',
    quality: 'رج ۵۰، پشم کرک، تار ابریشم، رنگ گیاهی', packaging: 'رول در پارچه محافظ و نایلون ضدرطوبت',
    cert: 'گواهی اصالت مرکز ملی فرش ایران', pay: 'اسکرو، TT', del: 'DDP، CIF، EXW',
    attrs: { knot_density: '50', material: 'پشم و ابریشم', design: 'ماهی درهم', size: '3x4 m' } },
  { s: 6, cat: 'solar', title: 'Monocrystalline PV Module 580W — N-Type TOPCon Bifacial', type: 'wholesale',
    unit: 'pcs', inv: 24000, moq: 620, price: 3250, cur: 'TRY', origin: ['CN', 'Zhejiang', 'Ningbo'], lead: 35,
    desc: 'N-type TOPCon bifacial module with glass-glass construction, up to 80% bifacial gain factor. 30-year linear power warranty with 0.4% annual degradation. Container-load pricing with ex-stock availability in Istanbul.',
    quality: '22.5% module efficiency, 0.4%/year degradation, glass-glass', packaging: '36 pcs per pallet, 620 pcs per 40ft HC',
    cert: 'IEC 61215, IEC 61730, TUV, CE', pay: 'LC, TT 30/70', del: 'FOB Ningbo, CIF Mersin, DAP Istanbul',
    attrs: { power_w: '580', cell_type: 'مونوکریستال', efficiency: '22.5' } },
  { s: 7, cat: 'freight', title: 'خدمات حمل زمینی یخچالی ترکیه ← ایران با ترخیص کامل', type: 'service',
    unit: 'container', inv: 40, moq: 1, price: 118000, cur: 'TRY', origin: ['TR', 'Istanbul', 'Istanbul'], lead: 3,
    desc: 'حمل یخچالی درب به درب از استانبول به تهران شامل بارگیری، ترخیص گمرک مرزی بازرگان، بیمه باربری و تحویل در انبار مقصد. پایش دمای آنلاین در کل مسیر.',
    quality: 'پایش دمای ۲۴ ساعته، بیمه تا ۱۰۰٬۰۰۰ یورو', packaging: '—', cert: 'مجوز حمل بین‌المللی TIR',
    pay: 'نقدی، اعتباری ۳۰ روزه', del: 'DAP Tehran', attrs: { mode: 'زمینی', route: 'Istanbul → Bazargan → Tehran', transit_days: '6' } },
  { s: 7, cat: 'customs', title: 'Customs Clearance & Documentation Service — Türkiye', type: 'service',
    unit: 'project', inv: 100, moq: 1, price: 24500, cur: 'TRY', origin: ['TR', 'Istanbul', 'Istanbul'], lead: 2,
    desc: 'Import and export customs clearance across all Turkish ports and land borders. Includes HS code classification, declaration filing, duty calculation and bonded warehouse coordination.',
    quality: 'Licensed customs broker, average clearance 36 hours', packaging: '—', cert: 'Gümrük Müşavirliği License',
    pay: 'Invoice 15 days', del: 'Service' },
  { s: 8, cat: 'nuts', title: 'پسته اکبری خندان ممتاز — سایز ۲۰/۲۲', type: 'export',
    unit: 'kg', inv: 46000, moq: 500, price: 1120, cur: 'TRY', origin: ['IR', 'کرمان', 'Rafsanjan'], lead: 12,
    desc: 'پسته اکبری خندان با سورت لیزری چهار مرحله‌ای و کنترل آفلاتوکسین در آزمایشگاه معتمد. مناسب بازارهای اروپا با سختگیرانه‌ترین حد مجاز.',
    quality: 'آفلاتوکسین زیر ۴ ppb، رطوبت زیر ۶٪، خندانی بالای ۹۵٪', packaging: 'کیسه کنفی ۵۰ کیلویی با لاینر، کارتن ۱۰ کیلویی وکیوم',
    cert: 'HACCP, ISO 22000, Health Certificate', pay: 'LC، TT، اسکرو', del: 'FOB Bandar Abbas, CIF Hamburg',
    attrs: { grade: 'A+', moisture: '5.5', harvest_year: '2025', packing: 'کیسه ۵۰ کیلویی', organic: '0' } },
  { s: 8, cat: 'nuts', title: 'کشمش پلویی سبز قزوین — درجه یک صادراتی', type: 'wholesale',
    unit: 'kg', inv: 88000, moq: 1000, price: 268, cur: 'TRY', origin: ['IR', 'قزوین', 'Takestan'], lead: 10,
    desc: 'کشمش پلویی سبز با خشک‌کردن سایه‌ای سنتی، شست‌وشوی صنعتی و سورت نوری. بدون افزودنی و بدون گوگرد.',
    quality: 'بدون گوگرد، رطوبت ۱۴ تا ۱۶٪', packaging: 'کارتن ۱۰ کیلویی، کیسه ۲۰ کیلویی',
    cert: 'HACCP, Organic', pay: 'TT، اسکرو', del: 'FOB, EXW',
    attrs: { grade: 'A', moisture: '15', harvest_year: '2025', packing: 'کارتن ۱۰ کیلویی', organic: '1' } },
  { s: 9, cat: 'disposables', title: 'Sterile Surgical Gown Level 3 — SMS Reinforced', type: 'wholesale',
    unit: 'pcs', inv: 380000, moq: 5000, price: 62, cur: 'TRY', origin: ['TR', 'Ankara', 'Ankara'], lead: 20,
    desc: 'AAMI Level 3 reinforced surgical gown made of SMS non-woven with impervious reinforcement panels. EO sterilized, individually packed with two towels.',
    quality: 'AAMI Level 3, EO sterilized, SAL 10-6', packaging: 'Individual peel pouch, 30 pcs per carton',
    cert: 'CE MDR, ISO 13485, EN 13795', pay: 'TT 30% advance, LC', del: 'FOB Istanbul, CIF Umm Qasr' },
  { s: 9, cat: 'lab', title: 'Benchtop Laboratory Centrifuge — 16,000 RPM Refrigerated', type: 'wholesale',
    unit: 'pcs', inv: 40, moq: 1, price: 168000, cur: 'TRY', origin: ['TR', 'Ankara', 'Ankara'], lead: 25,
    desc: 'Refrigerated benchtop centrifuge with brushless motor, interchangeable rotors and 99-program memory. Temperature range -20 to +40 C.',
    quality: 'Brushless motor, 16,000 RPM, -20 to +40 C', packaging: 'Carton with EPS inserts',
    cert: 'CE, ISO 13485', pay: 'TT, Escrow', del: 'FOB Istanbul, DAP' },
  { s: 2, cat: 'petrochem', title: 'Bitumen 60/70 in New Steel Drums', type: 'export',
    unit: 'ton', inv: 5000, moq: 100, price: 21800, cur: 'TRY', origin: ['AE', 'Dubai', 'Jebel Ali'], lead: 15,
    desc: 'Penetration grade bitumen 60/70 packed in new 180 kg steel drums, conforming to ASTM D946. Inspection by SGS available on buyer request.',
    quality: 'Penetration 60-70 dmm, softening point 49-56 C, ASTM D946', packaging: '180 kg new steel drum, 80 drums per 20ft',
    cert: 'SGS inspection, ASTM D946', pay: 'LC at sight, TT', del: 'FOB Jebel Ali, CFR' },
  { s: 5, cat: 'machine-carpet', title: 'فرش ماشینی ۱۲۰۰ شانه اکریلیک — طرح وینتیج', type: 'retail',
    unit: 'pcs', inv: 900, moq: 4, price: 8900, cur: 'TRY', origin: ['IR', 'اصفهان', 'Kashan'], lead: 7,
    desc: 'فرش ماشینی ۱۲۰۰ شانه تراکم ۳۶۰۰ با نخ اکریلیک هیت‌ست، طرح وینتیج محو با پالت رنگی خنثی. مناسب فروشگاه‌های خرده‌فروشی و پروژه‌های مسکونی.',
    quality: '۱۲۰۰ شانه، تراکم ۳۶۰۰، اکریلیک هیت‌ست', packaging: 'رول در نایلون شرینک',
    cert: 'ISO 9001', pay: 'نقدی، اسکرو', del: 'EXW, DAP' },
];

function ensureListing(L) {
  const seller = sellers[L.s];
  const cid = catId(L.cat);
  let row = q.get('SELECT * FROM listings WHERE title=? AND seller_id=?', [L.title, seller.id]);
  if (!row) {
    up(`INSERT INTO listings
      (seller_id,category_id,slug,title,listing_type,origin_country,origin_province,origin_city,
       measure_unit,inventory,inventory_unit,low_stock_threshold,moq,moq_unit,price,currency,price_unit,
       negotiable,lead_time_days,availability,description,quality,packaging,certifications,
       payment_terms,delivery_terms,status,wizard_step,is_featured,boost_rank,views_count,published_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,'in_stock',?,?,?,?,?,?, 'approved',7,?,?,?, datetime('now','-' || ? || ' days'))`,
      [seller.id, cid, H.slugify(L.title), L.title, L.type, L.origin[0], L.origin[1], L.origin[2],
       L.unit, L.inv, L.unit, Math.round(L.inv * 0.08), L.moq, L.unit, L.price, L.cur, L.unit,
       L.lead, L.desc, L.quality, L.packaging, L.cert, L.pay, L.del,
       Math.random() < 0.35 ? 1 : 0, rnd(0, 3), rnd(120, 4800), rnd(1, 60)]);
    row = q.get('SELECT * FROM listings WHERE title=? AND seller_id=?', [L.title, seller.id]);
    up('UPDATE listings SET slug=? WHERE id=?', [H.slugify(L.title, row.id), row.id]);
    const tr = LISTING_TITLES[L.title];
    if (tr) up('UPDATE listings SET title_fa=?, title_en=? WHERE id=?', [tr.fa || null, tr.en || null, row.id]);
    up('INSERT INTO listing_status_history (listing_id,from_status,to_status,actor_id,reason) VALUES (?,?,?,?,?)',
      [row.id, 'pending_review', 'approved', admin.id, 'اطلاعات کامل و تصاویر معتبر']);
    up('INSERT INTO listing_price_history (listing_id,old_price,new_price,currency,price_unit,reason,actor_id) VALUES (?,?,?,?,?,?,?)',
      [row.id, Math.round(L.price * 1.06), L.price, L.cur, L.unit, 'اصلاح قیمت فصلی', seller.id]);
    up('INSERT INTO listing_inventory_history (listing_id,old_stock,new_stock,unit,availability,actor_id) VALUES (?,?,?,?,?,?)',
      [row.id, L.inv * 0.7, L.inv, L.unit, 'in_stock', seller.id]);
    Object.entries(L.attrs || {}).forEach(([k, v]) => {
      const a = q.get('SELECT id FROM attributes WHERE category_id=? AND akey=?', [cid, k]);
      up('INSERT INTO listing_attributes (listing_id,attribute_id,akey,value) VALUES (?,?,?,?)', [row.id, a ? a.id : null, k, String(v)]);
    });
    for (let d = 1; d <= 30; d += 1) {
      const n = rnd(2, 60);
      for (let k = 0; k < Math.min(n, 12); k += 1)
        up(`INSERT INTO listing_views (listing_id,viewer_id,day,source,created_at)
             VALUES (?,?, date('now','-' || ? || ' days'), ?, datetime('now','-' || ? || ' days'))`,
          [row.id, null, d, pick(['search', 'category', 'home', 'direct', 'storefront']), d]);
    }
  }
  return row;
}
const listings = LISTINGS.map(ensureListing);
console.log('listings:', listings.length);

/* ---- attach catalog photography to the flagship listings ---- */
const PHOTOS = [
  ['/img/p/saffron.jpg', ['زعفران سرگل', 'زعفران نگین']],
  ['/img/p/fabric.jpg', ['Cotton Poplin']],
  ['/img/p/towels.jpg', ['Hotel Collection Bath Towel']],
  ['/img/p/polymer.jpg', ['HDPE Injection', 'Bitumen']],
  ['/img/p/stone.jpg', ['مرمریت کرم دهبید', 'تراورتن سیلور']],
  ['/img/p/machinery.jpg', ['Industrial Belt Dryer', 'Automatic Vacuum Packaging']],
  ['/img/p/carpet.jpg', ['فرش دستباف تبریز', 'فرش ماشینی']],
  ['/img/p/solar.jpg', ['Monocrystalline PV Module']],
  ['/img/p/freight.jpg', ['خدمات حمل زمینی', 'Customs Clearance']],
  ['/img/p/pistachio.jpg', ['پسته اکبری', 'کشمش پلویی']],
  ['/img/p/surgical-gown.jpg', ['Sterile Surgical Gown']],
  ['/img/p/centrifuge.jpg', ['Benchtop Laboratory Centrifuge']],
];
PHOTOS.forEach(([path, keys]) => keys.forEach((k) => {
  q.all('SELECT id FROM listings WHERE title LIKE ?', ['%' + k + '%']).forEach((row) => {
    if (!q.get('SELECT 1 x FROM listing_media WHERE listing_id=? AND path=?', [row.id, path]))
      up("INSERT INTO listing_media (listing_id,path,kind,sort_order) VALUES (?,?,'image',0)", [row.id, path]);
  });
}));

/* a few non-approved listings for the moderation queue */
[['کود کشاورزی NPK 20-20-20 محلول در آب', 8, 'agri', 'pending_review'],
 ['Stretch Film Jumbo Roll 23 Micron', 2, 'polymer', 'pending_review'],
 ['روغن زیتون فرابکر ارگانیک — بسته ۵ لیتری', 8, 'oils', 'need_correction']]
  .forEach(([title, si, cslug, st]) => {
    if (!q.get('SELECT 1 x FROM listings WHERE title=?', [title])) {
      const seller = sellers[si];
      up(`INSERT INTO listings (seller_id,category_id,slug,title,listing_type,measure_unit,inventory,moq,price,currency,price_unit,
          description,status,wizard_step,origin_country,origin_city,moderation_reason)
          VALUES (?,?,?,?, 'wholesale','kg',?,?,?,'TRY','kg',?,?,7,?,?,?)`,
        [seller.id, catId(cslug), H.slugify(title), title, rnd(500, 9000), rnd(10, 200), rnd(80, 900),
         'محصول ثبت‌شده و در انتظار بازبینی تیم پایش کیفیت مایدان.', st,
         seller.id % 2 ? 'IR' : 'TR', 'Tehran', st === 'need_correction' ? 'تصاویر کیفیت کافی ندارند و آنالیز محصول پیوست نشده است.' : null]);
    }
  });

/* ---------------- buy requests + quotes ---------------- */
const RFQS = [
  { b: 0, cat: 'saffron-spice', title: 'خرید ۲۰۰ کیلوگرم زعفران سرگل گرید I برای بازار آلمان', qty: 200, unit: 'kg',
    budget: 8000000, country: 'DE', city: 'Rotterdam', incoterm: 'CIF',
    desc: 'به دنبال تأمین‌کننده پایدار زعفران سرگل با آنالیز مستقل و امکان تحویل ماهانه ۲۰۰ کیلوگرم هستیم. حداکثر آفلاتوکسین طبق مقررات اتحادیه اروپا. بسته‌بندی با برند ما.' },
  { b: 1, cat: 'stone', title: 'استعلام ۸۰۰۰ متر مربع تراورتن برای پروژه مسکونی بغداد', qty: 8000, unit: 'm2',
    budget: 5600000, country: 'IQ', city: 'Baghdad', incoterm: 'DAP',
    desc: 'پروژه ۱۲ بلوک مسکونی، نیاز به تراورتن سیلور و کرم با ضخامت ۲ سانتی‌متر، تحویل مرحله‌ای در سه محموله طی چهار ماه.' },
  { b: 2, cat: 'food-machinery', title: 'خرید خط کامل خشک‌کن میوه با ظرفیت ۳۰۰ کیلوگرم در ساعت', qty: 1, unit: 'pcs',
    budget: 2200000, country: 'IR', city: 'Tehran', incoterm: 'CIF',
    desc: 'نیاز به خط خشک‌کن پیوسته برای سیب و زردآلو، ترجیحاً ساخت ترکیه یا اروپا، با آموزش نصب و راه‌اندازی در محل و تأمین قطعات یدکی دو ساله.' },
  { b: 3, cat: 'home-textile', title: 'Bulk order: 20,000 hotel bath towels 500-600 GSM', qty: 20000, unit: 'pcs',
    budget: 3800000, country: 'TR', city: 'Istanbul', incoterm: 'EXW',
    desc: 'Sourcing for a 14-hotel chain refresh. Need white 500-600 GSM towels with custom woven border, delivered in four monthly batches.' },
  { b: 4, cat: 'carpet', title: 'Handmade Tabriz carpets for German retail chain', qty: 60, unit: 'pcs',
    budget: 9000000, country: 'DE', city: 'Hamburg', incoterm: 'DDP',
    desc: 'Looking for 40-60 raj handmade carpets, sizes 2x3 and 3x4, classical and vintage designs, with authenticity certificates and DDP delivery to Hamburg.' },
  { b: 0, cat: 'nuts', title: 'Annual contract: 40 MT pistachio kernels, EU aflatoxin compliant', qty: 40, unit: 'ton',
    budget: 44000000, country: 'NL', city: 'Rotterdam', incoterm: 'CIF',
    desc: 'Annual supply contract with quarterly shipments. Independent SGS testing at origin required for each lot.' },
  { b: 1, cat: 'solar', title: 'طلب عرض أسعار: 2 ميجاوات ألواح شمسية أحادية البلورة', qty: 3400, unit: 'pcs',
    budget: 11000000, country: 'IQ', city: 'Basra', incoterm: 'CFR',
    desc: 'مشروع محطة شمسية 2 ميجاوات في البصرة. مطلوب ألواح 550-600 واط مع ضمان أداء 25 سنة وشهادات IEC.' },
  { b: 2, cat: 'polymer', title: 'خرید ماهانه ۱۰۰ تن HDPE گرید تزریقی', qty: 100, unit: 'ton',
    budget: 4200000, country: 'IR', city: 'Tehran', incoterm: 'CFR',
    desc: 'قرارداد تأمین ماهانه با امکان تعدیل قیمت بر اساس نرخ جهانی، پرداخت اعتباری ۹۰ روزه مورد نظر است.' },
];
const rfqCols = q.all("PRAGMA table_info(buy_requests)").map((c) => c.name);
RFQS.forEach((R) => {
  if (q.get('SELECT 1 x FROM buy_requests WHERE title=?', [R.title])) return;
  const data = {
    buyer_id: buyers[R.b].id, category_id: catId(R.cat), title: R.title, description: R.desc,
    quantity: R.qty, unit: R.unit, target_price: Math.round(R.budget / Math.max(1, R.qty)),
    currency: 'TRY', destination: `${R.city}, ${R.country}`, origin_preference: pick(['TR', 'IR', 'CN', 'هر مبدأ']),
    looking_for: pick(['تولیدکننده', 'توزیع‌کننده', 'صادرکننده', 'هر تأمین‌کننده معتبر']),
    wholesale_experience: pick(['دارد', 'ندارد']),
    packaging_requirement: 'بسته‌بندی صادراتی استاندارد و مقاوم در برابر رطوبت',
    quality_requirement: 'مطابق نمونه تأییدشده و آنالیز پیوست',
    certificate_requirement: 'CE / ISO / Health Certificate بسته به کالا',
    contact_preference: pick(['messaging', 'phone', 'both']),
    status: 'approved', deadline: null, views_count: rnd(30, 900),
  };
  const cols = Object.keys(data).filter((k) => rfqCols.includes(k));
  up(`INSERT INTO buy_requests (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((c) => data[c]));
  const rtr = REQUEST_TITLES[data.title];
  if (rtr) {
    const row = q.get('SELECT id FROM buy_requests WHERE title=? ORDER BY id DESC LIMIT 1', [data.title]);
    if (row) up('UPDATE buy_requests SET title_fa=?, title_en=?, title_ar=? WHERE id=?',
      [rtr.fa || null, rtr.en || null, rtr.ar || null, row.id]);
  }
});

const quoteCols = q.all('PRAGMA table_info(quotes)').map((c) => c.name);
q.all("SELECT * FROM buy_requests WHERE status='approved'").forEach((br) => {
  if (q.get('SELECT 1 x FROM quotes WHERE buy_request_id=?', [br.id])) return;
  const cands = q.all(
    `SELECT DISTINCT seller_id FROM listings WHERE category_id=? AND status='approved' LIMIT 3`, [br.category_id]);
  const pool = cands.length ? cands.map((c) => c.seller_id) : sellers.slice(0, 3).map((s) => s.id);
  pool.forEach((sid, i) => {
    const unitPrice = Math.round((br.budget_max / Math.max(1, br.quantity)) * (0.86 + i * 0.07));
    const data = {
      buy_request_id: br.id, seller_id: sid, buyer_id: br.buyer_id, price: unitPrice, currency: 'TRY',
      unit: br.unit, quantity: br.quantity, moq: Math.max(1, Math.round(br.quantity * 0.25)),
      tax: 0, shipping: Math.round(unitPrice * br.quantity * 0.04), incoterm: br.incoterm,
      lead_time_days: rnd(10, 45), payment_terms: pick(['TT 30/70', 'LC at sight', 'Escrow', 'TT 50% advance']),
      seller_note: 'قیمت بر اساس حجم اعلامی و شرایط تحویل درخواستی محاسبه شده است. امکان بازنگری برای سفارش‌های بزرگ‌تر وجود دارد.',
      version: 1, status: i === 0 ? 'sent' : 'sent',
    };
    const cols = Object.keys(data).filter((k) => quoteCols.includes(k));
    up(`INSERT INTO quotes (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((c) => data[c]));
  });
});

/* one negotiated quote chain */
(() => {
  const base = q.get("SELECT * FROM quotes ORDER BY id LIMIT 1");
  if (base && !q.get('SELECT 1 x FROM quotes WHERE parent_quote_id=?', [base.id])) {
    up(`INSERT INTO quotes (buy_request_id,seller_id,buyer_id,price,currency,unit,quantity,incoterm,lead_time_days,
        payment_terms,buyer_note,version,parent_quote_id,status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'countered')`,
      [base.buy_request_id, base.seller_id, base.buyer_id, Math.round(base.price * 0.92), base.currency, base.unit,
       base.quantity, base.incoterm, base.lead_time_days, base.payment_terms,
       'با توجه به حجم سفارش و پرداخت نقدی، امکان اعمال تخفیف ۸ درصدی وجود دارد؟', 2, base.id]);
    up("UPDATE quotes SET status='countered' WHERE id=?", [base.id]);
  }
})();

/* ---------------- orders ---------------- */
const ORDER_STATES = ['pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'completed', 'completed', 'disputed'];
listings.slice(0, 8).forEach((L, i) => {
  const buyer = buyers[i % buyers.length];
  const no = 'MD-' + String(100000 + i * 137);
  if (q.get('SELECT 1 x FROM orders WHERE order_no=?', [no])) return;
  const qty = Math.max(L.moq, Math.round(L.moq * rnd(1, 4)));
  const sub = Math.round(qty * L.price);
  const ship = Math.round(sub * 0.05);
  const status = ORDER_STATES[i];
  const bp = q.get('SELECT * FROM profiles WHERE user_id=?', [buyer.id]) || {};
  const payStatus = status === 'pending_payment' ? 'unpaid' : status === 'completed' ? 'released' : status === 'disputed' ? 'disputed' : 'held';
  up(`INSERT INTO orders (order_no,buyer_id,seller_id,subtotal,tax,shipping,discount,total,currency,incoterm,
        po_reference,ship_name,ship_phone,ship_country,ship_city,ship_address,ship_method,status,payment_status,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now','-' || ? || ' days'))`,
    [no, buyer.id, L.seller_id, sub, 0, ship, 0, sub + ship, L.currency,
     pick(['FOB', 'CIF', 'EXW', 'DAP']), 'PO-' + rnd(2000, 9999), buyer.display_name, buyer.phone,
     bp.country || 'TR', bp.city || 'Istanbul', bp.address || `${bp.city || 'Istanbul'} — انبار مرکزی خریدار`,
     pick(['sea', 'road', 'air']), status, payStatus, 30 - i * 2]);
  const o = q.get('SELECT * FROM orders WHERE order_no=?', [no]);
  up('INSERT INTO order_items (order_id,listing_id,title,quantity,unit_price,line_total,currency) VALUES (?,?,?,?,?,?,?)',
    [o.id, L.id, L.title, qty, L.price, sub, L.currency]);
  const flow = ['pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'completed'];
  const upto = flow.indexOf(status) === -1 ? flow.length : flow.indexOf(status) + 1;
  flow.slice(0, upto).forEach((st, k) => up(
    `INSERT INTO order_status_history (order_id,from_status,to_status,actor_id,note,created_at)
     VALUES (?,?,?,?,?,datetime('now','-' || ? || ' days'))`,
    [o.id, k ? flow[k - 1] : null, st, k ? L.seller_id : buyer.id, null, Math.max(1, 30 - k * 4)]));
  if (status !== 'pending_payment') {
    up(`INSERT INTO payment_intents (idempotency_key,order_id,payer_id,payee_id,amount_minor,currency,provider,status,escrow)
        VALUES (?,?,?,?,?,?, 'mock', 'succeeded', ?)`,
      ['ord-' + o.id, o.id, buyer.id, L.seller_id, (sub + ship) * 100, L.currency,
       status === 'completed' ? 'released' : status === 'disputed' ? 'disputed' : 'held']);
  }
  if (['shipped', 'delivered', 'completed'].includes(status)) {
    up(`INSERT INTO shipments (order_id,carrier,method,tracking_no,origin,destination,weight_kg,package_count,eta,status)
        VALUES (?,?,?,?,?,?,?,?, date('now','+7 days'), ?)`,
      [o.id, pick(['DHL', 'Bosphorus Freight', 'Maersk', 'TIR Land Line']), pick(['sea', 'road', 'air']),
       'TRK' + rnd(1000000, 9999999), `${L.origin_city}, ${L.origin_country}`,
       `${bp.city || 'Istanbul'}, ${bp.country || 'TR'}`, qty * rnd(1, 20), rnd(1, 40),
       status === 'shipped' ? 'in_transit' : 'delivered']);
  }
  if (status === 'completed') {
    up(`INSERT INTO reviews (target_user_id,reviewer_id,order_id,score,body,transaction_verified,seller_response,status)
        VALUES (?,?,?,?,?,1,?, 'published')`,
      [L.seller_id, buyer.id, o.id, rnd(4, 5),
       'کیفیت مطابق نمونه ارسالی بود، بسته‌بندی استاندارد و ارسال طبق زمان‌بندی توافق‌شده انجام شد. قطعاً دوباره خرید می‌کنیم.',
       'از اعتماد شما سپاسگزاریم؛ مشتاق همکاری در سفارش‌های بعدی هستیم.']);
  }
  if (status === 'disputed') {
    up(`INSERT INTO disputes (order_id,opener_id,claim,evidence,status) VALUES (?,?,?,?, 'open')`,
      [o.id, buyer.id, 'عدم تطابق کیفیت بخشی از محموله با نمونه تأییدشده',
       'گزارش بازرسی مستقل و تصاویر محموله در گفتگوی سفارش پیوست شده است.']);
  }
});

/* ---------------- conversations ---------------- */
listings.slice(0, 6).forEach((L, i) => {
  const buyer = buyers[i % buyers.length];
  const a = Math.min(buyer.id, L.seller_id); const b = Math.max(buyer.id, L.seller_id);
  let c = q.get('SELECT * FROM conversations WHERE a_id=? AND b_id=? AND context_id=?', [a, b, L.id]);
  if (!c) {
    up(`INSERT INTO conversations (a_id,b_id,context_type,context_id) VALUES (?,?, 'listing', ?)`, [a, b, L.id]);
    c = q.get('SELECT * FROM conversations WHERE a_id=? AND b_id=? AND context_id=?', [a, b, L.id]);
    const script = [
      [buyer.id, 'سلام، برای این کالا امکان ارسال نمونه پیش از سفارش اصلی وجود دارد؟'],
      [L.seller_id, 'سلام و وقت بخیر. بله، نمونه با هزینه پست بر عهده خریدار ارسال می‌شود و در صورت ثبت سفارش، مبلغ آن کسر خواهد شد.'],
      [buyer.id, `برای حجم ${Math.round(L.moq * 3)} ${L.measure_unit} بهترین قیمت CIF چقدر می‌شود؟`],
      [L.seller_id, 'برای این حجم می‌توانیم حدود ۶ درصد زیر قیمت لیست ارائه دهیم. پیش‌فاکتور رسمی را همین امروز ارسال می‌کنم.'],
      [buyer.id, 'عالی است، منتظر پیش‌فاکتور هستم. لطفاً شرایط پرداخت و زمان تحویل را هم دقیق قید کنید.'],
    ];
    script.forEach(([sid, body], k) => up(
      `INSERT INTO messages (conversation_id,sender_id,body,read_at,created_at)
       VALUES (?,?,?,?,datetime('now','-' || ? || ' hours'))`,
      [c.id, sid, body, k < 4 ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null, 40 - k * 6]));
    up("UPDATE conversations SET last_message=?, last_message_at=datetime('now','-16 hours') WHERE id=?",
      [script[script.length - 1][1].slice(0, 120), c.id]);
  }
});

/* ---------------- CRM lists, bookmarks, follows ---------------- */
buyers.forEach((b, i) => {
  ['تأمین‌کنندگان منتخب', 'در حال مذاکره', 'بایگانی'].forEach((nm, k) => {
    if (!q.get('SELECT 1 x FROM saved_lists WHERE owner_id=? AND name=?', [b.id, nm]))
      up('INSERT INTO saved_lists (owner_id,name,color) VALUES (?,?,?)', [b.id, nm, pick(['gold', 'green', 'blue'])]);
  });
  const list = q.get('SELECT * FROM saved_lists WHERE owner_id=? ORDER BY id LIMIT 1', [b.id]);
  sellers.slice(i, i + 3).forEach((s) => {
    if (!q.get('SELECT 1 x FROM saved_list_members WHERE list_id=? AND target_user_id=?', [list.id, s.id]))
      up('INSERT INTO saved_list_members (list_id,target_user_id,status) VALUES (?,?,?)',
        [list.id, s.id, pick(['new', 'contacted', 'negotiating', 'won'])]);
    if (!q.get('SELECT 1 x FROM follows WHERE follower_id=? AND followee_id=?', [b.id, s.id]))
      up('INSERT INTO follows (follower_id,followee_id) VALUES (?,?)', [b.id, s.id]);
    if (!q.get('SELECT 1 x FROM user_notes WHERE owner_id=? AND target_user_id=?', [b.id, s.id]))
      up('INSERT INTO user_notes (owner_id,target_user_id,list_id,body) VALUES (?,?,?,?)',
        [b.id, s.id, list.id, 'پاسخگویی سریع و قیمت رقابتی. پیگیری مجدد در فصل بعد و درخواست نمونه جدید.']);
  });
  listings.slice(i, i + 4).forEach((L) => {
    if (!q.get('SELECT 1 x FROM bookmarks WHERE user_id=? AND target_type=? AND target_id=?', [b.id, 'listing', L.id]))
      up('INSERT INTO bookmarks (user_id,target_type,target_id) VALUES (?,?,?)', [b.id, 'listing', L.id]);
  });
});

/* ---------------- stories ---------------- */
const storyCols = q.all('PRAGMA table_info(stories)').map((c) => c.name);
[[0, 'برداشت زعفران پاییز ۱۴۰۴ آغاز شد', 'اولین محموله سرگل امروز وارد خط بسته‌بندی شد.'],
 [1, 'New GOTS certified organic cotton line', 'Now weaving certified organic poplin in 12 base colors.'],
 [4, 'Belt dryer installation in Tabriz', 'Our 500 kg/h line is now running at a customer facility in Iran.'],
 [5, 'فرش ۷۰ رج جدید کارگاه', 'بافت طرح سفارشی مشتری آلمانی به پایان رسید.'],
 [6, 'TOPCon bifacial stock arrived in Istanbul', '2,400 modules now available ex-stock for immediate delivery.']]
  .forEach(([si, title, body]) => {
    if (q.get('SELECT 1 x FROM stories WHERE caption LIKE ?', [title + '%'])) return;
    up(`INSERT INTO stories (user_id,media_kind,caption,cta_label,cta_type,status,expires_at,views_count)
        VALUES (?, 'text', ?, ?, 'profile', 'active', datetime('now','+7 days'), ?)`,
      [sellers[si].id, title + ' — ' + body, 'مشاهده غرفه', rnd(20, 600)]);
    const cap = title + ' — ' + body;
    const str = STORY_CAPTIONS[cap];
    const row = q.get('SELECT id FROM stories WHERE caption=?', [cap]);
    if (str && row) up('UPDATE stories SET caption_fa=?, caption_en=? WHERE id=?',
      [str.fa || null, str.en || null, row.id]);
  });

/* One approved VIP hero story so the paid-banner feature is visible out of the box,
   plus one pending request so admins have something to review. */
(() => {
  const vip = q.get("SELECT id, user_id FROM stories WHERE caption LIKE 'برداشت زعفران%'");
  if (vip) up(`UPDATE stories SET is_vip=1, vip_status='active', vip_paid=1,
      vip_price_minor=150000, vip_currency='TRY', vip_sort=10,
      vip_starts_at=date('now','-3 days'), vip_ends_at=date('now','+11 days'),
      vip_headline=?, vip_subtext=?, vip_link=?, vip_image=?,
      vip_impressions=?, vip_clicks=? WHERE id=?`,
    ['زعفران سرگل برداشت جدید — مستقیم از مزرعه',
     'اولین محموله فصل، گرید I با گواهی ایزو ۳۶۳۲. سفارش پیش از پایان مهر با قیمت ویژه.',
     '/category/agri', '/img/p/saffron.jpg', rnd(4000, 9000), rnd(150, 400), vip.id]);

  const pending = q.get("SELECT id FROM stories WHERE caption LIKE 'TOPCon%'");
  if (pending) up(`UPDATE stories SET is_vip=1, vip_status='pending',
      vip_price_minor=150000, vip_currency='TRY',
      vip_headline=?, vip_subtext=?, vip_link=? WHERE id=?`,
    ['TOPCon Bifacial — Ex-Stock Istanbul',
     '2,400 modules ready for immediate delivery. Container pricing available.',
     '/category/electronics', pending.id]);
})();

/* ---------------- ads ---------------- */
[['Ramadan Sourcing Week', 'hero', 'هفته تأمین رمضان', 'تخفیف ویژه تأمین‌کنندگان تأییدشده روی خشکبار و مواد غذایی', '/category/agri'],
 ['Textile Expo Bursa', 'feed', 'Bursa Textile Expo 2026', 'Meet 120 verified mills — book a meeting slot', '/category/textile'],
 ['Solar Container Deal', 'category', 'پیشنهاد کانتینری پنل خورشیدی', 'قیمت ویژه برای سفارش‌های بالای ۶۰۰ عدد', '/category/electronics']]
  .forEach(([name, placement, headline, subtext, link], i) => {
    if (q.get('SELECT 1 x FROM ad_campaigns WHERE name=?', [name])) return;
    up(`INSERT INTO ad_campaigns (owner_id,name,placement,budget_minor,model,headline,subtext,link_url,starts_at,ends_at,status,impressions,clicks)
        VALUES (?,?,?,?, 'flat',?,?,?, date('now','-10 days'), date('now','+40 days'), 'active', ?, ?)`,
      [sellers[i].id, name, placement, 250000, headline, subtext, link, rnd(2000, 40000), rnd(50, 900)]);
    const ac = AD_COPY[name];
    if (ac) up(`UPDATE ad_campaigns SET headline_fa=?, headline_en=?, subtext_fa=?, subtext_en=? WHERE name=?`,
      [(ac.fa||{}).headline||null, (ac.en||{}).headline||null,
       (ac.fa||{}).subtext||null, (ac.en||{}).subtext||null, name]);
  });

/* ---------------- support / reports ---------------- */
const tCols = q.all('PRAGMA table_info(tickets)').map((c) => c.name);
[[buyers[0].id, 'عدم دریافت پیش‌فاکتور از فروشنده', 'sales', 'open'],
 [sellers[2].id, 'Verification documents rejected — need clarification', 'kyc', 'answered'],
 [buyers[2].id, 'خطا در بارگذاری تصاویر کالا', 'technical', 'closed']]
  .forEach(([uid, subject, cat, st]) => {
    if (q.get('SELECT 1 x FROM tickets WHERE subject=?', [subject])) return;
    up('INSERT INTO tickets (user_id,category,subject,priority,status) VALUES (?,?,?,?,?)',
      [uid, cat, subject, pick(['normal', 'high']), st]);
    const t = q.get('SELECT * FROM tickets WHERE subject=?', [subject]);
    up('INSERT INTO ticket_messages (ticket_id,sender_id,body) VALUES (?,?,?)', [t.id, uid, 'شرح کامل مشکل در پیوست ارسال شد. لطفاً بررسی بفرمایید.']);
    if (st !== 'open') up('INSERT INTO ticket_messages (ticket_id,sender_id,body) VALUES (?,?,?)',
      [t.id, admin.id, 'با سلام، موضوع بررسی شد و پاسخ تفصیلی از طریق همین تیکت ارسال گردید.']);
  });

/* notifications */
[...sellers.slice(0, 5), ...buyers.slice(0, 3)].forEach((u) => {
  if (q.get('SELECT 1 x FROM notifications WHERE user_id=?', [u.id])) return;
  H.notify(u.id, { type: 'welcome', title: 'به مایدان خوش آمدید', body: 'پروفایل خود را کامل کنید تا در نتایج جستجو بالاتر دیده شوید.', link: '/account/profile' });
  H.notify(u.id, { type: 'kyc', title: 'احراز هویت تأیید شد', body: 'نشان تأییدشده روی پروفایل شما فعال شد.', link: '/kyc' });
  H.notify(u.id, { type: 'system', title: 'گزارش هفتگی عملکرد', body: 'بازدید غرفه شما نسبت به هفته گذشته رشد داشته است.', link: '/dashboard' });
});

/* plugins */
[['mydan.payment.stripe', 'Stripe Payments', '1.2.0', 'MYDAN Labs', 'درگاه پرداخت بین‌المللی Stripe با پشتیبانی از ۳D Secure.', 'enabled'],
 ['mydan.shipping.dhl', 'DHL Rates & Tracking', '0.9.4', 'MYDAN Labs', 'محاسبه نرخ لحظه‌ای و رهگیری مرسولات DHL Express.', 'enabled'],
 ['mydan.analytics.ga4', 'Google Analytics 4', '1.0.1', 'Community', 'ارسال رویدادهای تجارت الکترونیک به GA4.', 'disabled'],
 ['mydan.sms.twilio', 'Twilio SMS Gateway', '2.0.0', 'Community', 'ارسال کد یکبار مصرف و اعلان پیامکی از طریق Twilio.', 'installed']]
  .forEach(([pid, name, ver, author, desc, st]) => up(
    `INSERT INTO plugins (plugin_id,name,version,author,description,manifest_json,status,health)
     VALUES (?,?,?,?,?,?,?, 'ok')
     ON CONFLICT(plugin_id) DO UPDATE SET name=excluded.name, version=excluded.version`,
    [pid, name, ver, author, desc, JSON.stringify({
      id: pid, name, version: ver, author, description: desc,
      permissions: ['read:orders', 'write:payments'], hooks: ['order.created', 'payment.succeeded'],
      settings: [{ key: 'api_key', type: 'secret', label: 'API Key' }],
    }), st]));

/* audit trail */
if (!q.get('SELECT 1 x FROM audit_logs')) {
  H.audit(admin.id, 'seed.bootstrap', 'system', 0, null, { note: 'initial data load' }, '127.0.0.1');
  listings.slice(0, 5).forEach((L) => H.audit(admin.id, 'listing.approve', 'listing', L.id, { status: 'pending_review' }, { status: 'approved' }, '127.0.0.1'));
}

console.log('Seed complete.');
console.log('  users     :', q.get('SELECT COUNT(*) c FROM users').c);
console.log('  categories:', q.get('SELECT COUNT(*) c FROM categories').c);
console.log('  attributes:', q.get('SELECT COUNT(*) c FROM attributes').c);
console.log('  listings  :', q.get('SELECT COUNT(*) c FROM listings').c);
console.log('  requests  :', q.get('SELECT COUNT(*) c FROM buy_requests').c);
console.log('  quotes    :', q.get('SELECT COUNT(*) c FROM quotes').c);
console.log('  orders    :', q.get('SELECT COUNT(*) c FROM orders').c);
console.log('  messages  :', q.get('SELECT COUNT(*) c FROM messages').c);
console.log('  pages     :', q.get('SELECT COUNT(*) c FROM pages').c);
console.log('\nAdmin login: +905000000001 / password Mydan!2026 (or OTP via console)');
db.close();
