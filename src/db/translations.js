/**
 * Per-locale titles for the seeded catalogue.
 *
 * The demo data was authored in a mix of Persian and English, which made the storefront
 * look broken when the visitor switched language (English shoppers saw Persian product
 * names and vice-versa). Keyed by the source `title` used in seed.js; the seeder copies
 * these into listings.title_fa / title_en so the resolver can pick the right one.
 *
 * Only fa/en are provided — Turkish and Arabic shoppers fall back to the source title,
 * which is the intended graceful-degradation behaviour rather than showing blanks.
 */
const LISTING_TITLES = {
  'زعفران سرگل ممتاز صادراتی — گرید I ایزو ۳۶۳۲': {
    fa: 'زعفران سرگل ممتاز صادراتی — گرید I ایزو ۳۶۳۲',
    en: 'Premium Sargol Saffron for Export — Grade I, ISO 3632',
  },
  'زعفران نگین درجه یک — بسته‌بندی سفارشی برند خریدار': {
    fa: 'زعفران نگین درجه یک — بسته‌بندی سفارشی برند خریدار',
    en: 'Grade A Negin Saffron — Private Label Packaging',
  },
  'Cotton Poplin Fabric 120 GSM — Reactive Dyed': {
    fa: 'پارچه پوپلین نخی ۱۲۰ گرمی — رنگرزی راکتیو',
    en: 'Cotton Poplin Fabric 120 GSM — Reactive Dyed',
  },
  'Hotel Collection Bath Towel Set — 600 GSM Turkish Cotton': {
    fa: 'ست حوله حمام هتلی — پنبه ترک ۶۰۰ گرمی',
    en: 'Hotel Collection Bath Towel Set — 600 GSM Turkish Cotton',
  },
  'HDPE Injection Grade Granules — 5502 Series': {
    fa: 'گرانول HDPE گرید تزریقی — سری ۵۵۰۲',
    en: 'HDPE Injection Grade Granules — 5502 Series',
  },
  'مرمریت کرم دهبید — اسلب پولیش‌شده ۲ سانتی': {
    fa: 'مرمریت کرم دهبید — اسلب پولیش‌شده ۲ سانتی',
    en: 'Dehbid Cream Marble — Polished Slab 2 cm',
  },
  'تراورتن سیلور موج‌دار — تایل ۶۰×۳۰': {
    fa: 'تراورتن سیلور موج‌دار — تایل ۶۰×۳۰',
    en: 'Silver Wavy Travertine — 60×30 Tile',
  },
  'Industrial Belt Dryer — 500 kg/h Continuous Line': {
    fa: 'خشک‌کن نواری صنعتی — خط پیوسته ۵۰۰ کیلوگرم بر ساعت',
    en: 'Industrial Belt Dryer — 500 kg/h Continuous Line',
  },
  'Automatic Vacuum Packaging Machine — Double Chamber': {
    fa: 'دستگاه بسته‌بندی وکیوم اتوماتیک — دو محفظه',
    en: 'Automatic Vacuum Packaging Machine — Double Chamber',
  },
  'فرش دستباف تبریز ۵۰ رج — طرح ماهی درهم، ۳×۴ متر': {
    fa: 'فرش دستباف تبریز ۵۰ رج — طرح ماهی درهم، ۳×۴ متر',
    en: 'Handmade Tabriz Rug 50 Raj — Mahi Design, 3×4 m',
  },
  'Monocrystalline PV Module 580W — N-Type TOPCon Bifacial': {
    fa: 'پنل خورشیدی مونوکریستال ۵۸۰ وات — دوطرفه N-Type TOPCon',
    en: 'Monocrystalline PV Module 580W — N-Type TOPCon Bifacial',
  },
  'خدمات حمل زمینی یخچالی ترکیه ← ایران با ترخیص کامل': {
    fa: 'خدمات حمل زمینی یخچالی ترکیه ← ایران با ترخیص کامل',
    en: 'Refrigerated Road Freight Türkiye → Iran, Customs Included',
  },
  'Customs Clearance & Documentation Service — Türkiye': {
    fa: 'خدمات ترخیص گمرکی و مستندسازی — ترکیه',
    en: 'Customs Clearance & Documentation Service — Türkiye',
  },
  'پسته اکبری خندان ممتاز — سایز ۲۰/۲۲': {
    fa: 'پسته اکبری خندان ممتاز — سایز ۲۰/۲۲',
    en: 'Premium Akbari Pistachios, Naturally Opened — Size 20/22',
  },
  'کشمش پلویی سبز قزوین — درجه یک صادراتی': {
    fa: 'کشمش پلویی سبز قزوین — درجه یک صادراتی',
    en: 'Green Qazvin Polo Raisins — Export Grade A',
  },
  'Sterile Surgical Gown Level 3 — SMS Reinforced': {
    fa: 'گان جراحی استریل سطح ۳ — پارچه SMS تقویت‌شده',
    en: 'Sterile Surgical Gown Level 3 — SMS Reinforced',
  },
  'Benchtop Laboratory Centrifuge — 16,000 RPM Refrigerated': {
    fa: 'سانتریفیوژ آزمایشگاهی رومیزی — یخچال‌دار ۱۶٬۰۰۰ دور',
    en: 'Benchtop Laboratory Centrifuge — 16,000 RPM Refrigerated',
  },
  'Bitumen 60/70 in New Steel Drums': {
    fa: 'قیر ۶۰/۷۰ در بشکه فلزی نو',
    en: 'Bitumen 60/70 in New Steel Drums',
  },
  'فرش ماشینی ۱۲۰۰ شانه اکریلیک — طرح وینتیج': {
    fa: 'فرش ماشینی ۱۲۰۰ شانه اکریلیک — طرح وینتیج',
    en: 'Machine-Woven Acrylic Rug 1200 Reed — Vintage Design',
  },
};

/** Per-locale titles and excerpts for the seeded blog posts, keyed by source title. */
const BLOG_TITLES = {
  'راهنمای کامل صادرات زعفران در سال ۲۰۲۶': {
    fa: { title: 'راهنمای کامل صادرات زعفران در سال ۲۰۲۶',
          excerpt: 'از استانداردهای ایزو ۳۶۳۲ تا مستندات گمرکی و بسته‌بندی صادراتی.' },
    en: { title: 'The Complete Guide to Exporting Saffron in 2026',
          excerpt: 'From ISO 3632 grading to customs documentation and export packaging.' },
  },
  'اینکوترمز ۲۰۲۰ به زبان ساده': {
    fa: { title: 'اینکوترمز ۲۰۲۰ به زبان ساده',
          excerpt: 'یازده قاعده تحویل کالا و اینکه هزینه و ریسک دقیقاً کجا جابه‌جا می‌شود.' },
    en: { title: 'Incoterms 2020 in Plain Language',
          excerpt: 'The eleven delivery rules and exactly where cost and risk change hands.' },
  },
  'چگونه یک درخواست خرید بنویسیم که پاسخ بگیرد': {
    fa: { title: 'چگونه یک درخواست خرید بنویسیم که پاسخ بگیرد',
          excerpt: 'هفت عنصر که نرخ پاسخ RFQ شما را چند برابر می‌کند.' },
    en: { title: 'How to Write an RFQ That Actually Gets Replies',
          excerpt: 'Seven elements that multiply your RFQ response rate.' },
  },
  'شش سیگنال اعتماد که خریداران عمده به آن نگاه می‌کنند': {
    fa: { title: 'شش سیگنال اعتماد که خریداران عمده به آن نگاه می‌کنند',
          excerpt: 'چرا برخی غرفه‌ها ده برابر بیشتر درخواست دریافت می‌کنند؟' },
    en: { title: 'Six Trust Signals Wholesale Buyers Look For',
          excerpt: 'Why some storefronts receive ten times more enquiries.' },
  },
  'روش‌های پرداخت در تجارت فرامرزی': {
    fa: { title: 'روش‌های پرداخت در تجارت فرامرزی',
          excerpt: 'مقایسه LC، TT، اسکرو و پرداخت مرحله‌ای از نظر ریسک و هزینه.' },
    en: { title: 'Payment Methods in Cross-Border Trade',
          excerpt: 'Comparing LC, TT, escrow and milestone payments by risk and cost.' },
  },
};

module.exports = { LISTING_TITLES, BLOG_TITLES };
