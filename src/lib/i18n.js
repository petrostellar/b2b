/** Localization engine: 4 locales, RTL/LTR, formatting helpers. */

const DICT = {
  fa: {
    dir: 'rtl', name: 'فارسی', flag: '🇮🇷',
    brand_tagline: 'بازار جهانی تجارت عمده و خرده',
    nav_home: 'خانه', nav_products: 'محصولات', nav_suppliers: 'تأمین‌کنندگان',
    nav_buyers: 'خریداران', nav_requests: 'درخواست‌های خرید', nav_stories: 'استوری',
    new_arrivals: 'تازه‌ترین‌ها',
    vip_badge: 'ویژه VIP',
    vip_cta: 'مشاهده',
    vip_title: 'بنر ویژه',
    vip_request: 'درخواست بنر ویژه',
    vip_pending: 'در انتظار تأیید',
    vip_active: 'فعال',
    vip_price: 'هزینه',
    vip_none: 'بنر ویژه‌ای ثبت نشده است',
    nav_messages: 'پیام‌ها', nav_account: 'حساب من', nav_pricing: 'عضویت',
    nav_blog: 'بلاگ', nav_help: 'راهنما', nav_about: 'درباره ما', nav_contact: 'تماس',
    nav_create: 'ثبت آگهی', nav_dashboard: 'داشبورد', nav_admin: 'مدیریت',
    login: 'ورود', register: 'ثبت‌نام', logout: 'خروج',
    search_placeholder: 'جستجوی محصول، تأمین‌کننده یا دسته‌بندی…',
    search: 'جستجو', filters: 'فیلترها', apply: 'اعمال', reset: 'حذف فیلترها',
    hero_title: 'تجارت جهانی، بدون واسطه',
    hero_sub: 'میدان، بستر دوطرفه خرید و فروش عمده و خرده برای تولیدکنندگان، توزیع‌کنندگان و بازرگانان در بیش از ۴۰ کشور.',
    hero_cta1: 'شروع فروش', hero_cta2: 'ثبت درخواست خرید',
    stat_suppliers: 'تأمین‌کننده فعال', stat_listings: 'آگهی کالا',
    stat_requests: 'درخواست خرید', stat_countries: 'کشور',
    cat_title: 'دسته‌بندی صنایع', cat_all: 'همه دسته‌ها',
    trending: 'پرطرفدارترین کالاها', verified_suppliers: 'تأمین‌کنندگان احراز شده',
    latest_requests: 'آخرین درخواست‌های خرید', featured: 'ویژه',
    view_all: 'مشاهده همه', price: 'قیمت', currency: 'ارز', moq: 'حداقل سفارش',
    inventory: 'موجودی', unit: 'واحد', seller: 'فروشنده', buyer: 'خریدار',
    verified: 'احراز هویت شده', rating: 'امتیاز', reviews: 'نظر',
    contact_seller: 'تماس با فروشنده', chat: 'گفتگو', request_quote: 'درخواست پیش‌فاکتور',
    request_sample: 'درخواست نمونه', add_cart: 'افزودن به سبد', buy_now: 'خرید',
    bookmark: 'ذخیره', share: 'اشتراک', report: 'گزارش تخلف',
    description: 'توضیحات', details: 'مشخصات', similar: 'کالاهای مشابه',
    other_products: 'سایر کالاهای فروشنده', location: 'موقعیت',
    save: 'ذخیره', cancel: 'انصراف', submit: 'ثبت', next: 'بعدی', back: 'قبلی',
    delete: 'حذف', edit: 'ویرایش', status: 'وضعیت', actions: 'عملیات',
    empty: 'موردی یافت نشد', loading: 'در حال بارگذاری…',
    footer_about: 'میدان یک بازارگاه بین‌المللی دوطرفه است که تجارت عمده، خرده و صادرات را در یک بستر امن گرد هم می‌آورد.',
    rights: 'تمامی حقوق محفوظ است.',
    theme: 'پوسته', language: 'زبان',
  },
  en: {
    dir: 'ltr', name: 'English', flag: '🇬🇧',
    brand_tagline: 'Global wholesale & retail trade network',
    nav_home: 'Home', nav_products: 'Products', nav_suppliers: 'Suppliers',
    nav_buyers: 'Buyers', nav_requests: 'Buy Requests', nav_stories: 'Stories',
    new_arrivals: 'New arrivals',
    vip_badge: 'VIP FEATURED',
    vip_cta: 'View',
    vip_title: 'VIP Banner',
    vip_request: 'Request VIP banner',
    vip_pending: 'Awaiting approval',
    vip_active: 'Active',
    vip_price: 'Price',
    vip_none: 'No VIP banners yet',
    nav_messages: 'Messages', nav_account: 'My Account', nav_pricing: 'Membership',
    nav_blog: 'Blog', nav_help: 'Help', nav_about: 'About', nav_contact: 'Contact',
    nav_create: 'Post Listing', nav_dashboard: 'Dashboard', nav_admin: 'Admin',
    login: 'Sign in', register: 'Sign up', logout: 'Sign out',
    search_placeholder: 'Search products, suppliers or categories…',
    search: 'Search', filters: 'Filters', apply: 'Apply', reset: 'Reset',
    hero_title: 'Global trade, direct.',
    hero_sub: 'Mydan is the two-sided marketplace connecting manufacturers, distributors and traders across 40+ countries — wholesale and retail.',
    hero_cta1: 'Start selling', hero_cta2: 'Post a buy request',
    stat_suppliers: 'Active suppliers', stat_listings: 'Live listings',
    stat_requests: 'Buy requests', stat_countries: 'Countries',
    cat_title: 'Industry categories', cat_all: 'All categories',
    trending: 'Trending products', verified_suppliers: 'Verified suppliers',
    latest_requests: 'Latest buy requests', featured: 'Featured',
    view_all: 'View all', price: 'Price', currency: 'Currency', moq: 'MOQ',
    inventory: 'Stock', unit: 'Unit', seller: 'Seller', buyer: 'Buyer',
    verified: 'Verified', rating: 'Rating', reviews: 'reviews',
    contact_seller: 'Contact supplier', chat: 'Chat', request_quote: 'Request quote',
    request_sample: 'Request sample', add_cart: 'Add to cart', buy_now: 'Buy now',
    bookmark: 'Save', share: 'Share', report: 'Report',
    description: 'Description', details: 'Specifications', similar: 'Similar products',
    other_products: 'More from this seller', location: 'Location',
    save: 'Save', cancel: 'Cancel', submit: 'Submit', next: 'Next', back: 'Back',
    delete: 'Delete', edit: 'Edit', status: 'Status', actions: 'Actions',
    empty: 'Nothing found', loading: 'Loading…',
    footer_about: 'Mydan is an international two-sided marketplace bringing wholesale, retail and export trade into one trusted platform.',
    rights: 'All rights reserved.',
    theme: 'Theme', language: 'Language',
  },
  tr: {
    dir: 'ltr', name: 'Türkçe', flag: '🇹🇷',
    brand_tagline: 'Küresel toptan ve perakende ticaret ağı',
    nav_home: 'Ana Sayfa', nav_products: 'Ürünler', nav_suppliers: 'Tedarikçiler',
    nav_buyers: 'Alıcılar', nav_requests: 'Alım Talepleri', nav_stories: 'Hikâyeler',
    new_arrivals: 'Yeni gelenler',
    vip_badge: 'VIP ÖNE ÇIKAN',
    vip_cta: 'Görüntüle',
    vip_title: 'VIP Banner',
    vip_request: 'VIP banner talebi',
    vip_pending: 'Onay bekliyor',
    vip_active: 'Aktif',
    vip_price: 'Ücret',
    vip_none: 'Henüz VIP banner yok',
    nav_messages: 'Mesajlar', nav_account: 'Hesabım', nav_pricing: 'Üyelik',
    nav_blog: 'Blog', nav_help: 'Yardım', nav_about: 'Hakkımızda', nav_contact: 'İletişim',
    nav_create: 'İlan Ver', nav_dashboard: 'Panel', nav_admin: 'Yönetim',
    login: 'Giriş', register: 'Kayıt ol', logout: 'Çıkış',
    search_placeholder: 'Ürün, tedarikçi veya kategori ara…',
    search: 'Ara', filters: 'Filtreler', apply: 'Uygula', reset: 'Sıfırla',
    hero_title: 'Küresel ticaret, aracısız.',
    hero_sub: 'Mydan; üreticileri, distribütörleri ve tüccarları 40+ ülkede buluşturan çift taraflı pazar yeridir.',
    hero_cta1: 'Satışa başla', hero_cta2: 'Alım talebi oluştur',
    stat_suppliers: 'Aktif tedarikçi', stat_listings: 'Yayındaki ilan',
    stat_requests: 'Alım talebi', stat_countries: 'Ülke',
    cat_title: 'Sektör kategorileri', cat_all: 'Tüm kategoriler',
    trending: 'Öne çıkan ürünler', verified_suppliers: 'Doğrulanmış tedarikçiler',
    latest_requests: 'Son alım talepleri', featured: 'Öne çıkan',
    view_all: 'Tümünü gör', price: 'Fiyat', currency: 'Para birimi', moq: 'Min. sipariş',
    inventory: 'Stok', unit: 'Birim', seller: 'Satıcı', buyer: 'Alıcı',
    verified: 'Doğrulanmış', rating: 'Puan', reviews: 'değerlendirme',
    contact_seller: 'Tedarikçiye ulaş', chat: 'Sohbet', request_quote: 'Teklif iste',
    request_sample: 'Numune iste', add_cart: 'Sepete ekle', buy_now: 'Satın al',
    bookmark: 'Kaydet', share: 'Paylaş', report: 'Bildir',
    description: 'Açıklama', details: 'Özellikler', similar: 'Benzer ürünler',
    other_products: 'Satıcının diğer ürünleri', location: 'Konum',
    save: 'Kaydet', cancel: 'İptal', submit: 'Gönder', next: 'İleri', back: 'Geri',
    delete: 'Sil', edit: 'Düzenle', status: 'Durum', actions: 'İşlemler',
    empty: 'Sonuç yok', loading: 'Yükleniyor…',
    footer_about: 'Mydan; toptan, perakende ve ihracat ticaretini tek güvenli platformda birleştiren uluslararası pazar yeridir.',
    rights: 'Tüm hakları saklıdır.',
    theme: 'Tema', language: 'Dil',
  },
  ar: {
    dir: 'rtl', name: 'العربية', flag: '🇸🇦',
    brand_tagline: 'شبكة التجارة العالمية بالجملة والتجزئة',
    nav_home: 'الرئيسية', nav_products: 'المنتجات', nav_suppliers: 'الموردون',
    nav_buyers: 'المشترون', nav_requests: 'طلبات الشراء', nav_stories: 'القصص',
    new_arrivals: 'وصل حديثاً',
    vip_badge: 'مميز VIP',
    vip_cta: 'عرض',
    vip_title: 'بانر مميز',
    vip_request: 'طلب بانر مميز',
    vip_pending: 'بانتظار الموافقة',
    vip_active: 'نشط',
    vip_price: 'السعر',
    vip_none: 'لا توجد بانرات مميزة',
    nav_messages: 'الرسائل', nav_account: 'حسابي', nav_pricing: 'العضوية',
    nav_blog: 'المدونة', nav_help: 'المساعدة', nav_about: 'من نحن', nav_contact: 'اتصل بنا',
    nav_create: 'أضف إعلان', nav_dashboard: 'لوحة التحكم', nav_admin: 'الإدارة',
    login: 'دخول', register: 'تسجيل', logout: 'خروج',
    search_placeholder: 'ابحث عن منتج أو مورد أو فئة…',
    search: 'بحث', filters: 'الفلاتر', apply: 'تطبيق', reset: 'إعادة',
    hero_title: 'تجارة عالمية بلا وسطاء',
    hero_sub: 'ميدان سوق ثنائي الجانب يربط المصنعين والموزعين والتجار في أكثر من ٤٠ دولة.',
    hero_cta1: 'ابدأ البيع', hero_cta2: 'أنشئ طلب شراء',
    stat_suppliers: 'مورد نشط', stat_listings: 'إعلان',
    stat_requests: 'طلب شراء', stat_countries: 'دولة',
    cat_title: 'فئات الصناعة', cat_all: 'كل الفئات',
    trending: 'المنتجات الرائجة', verified_suppliers: 'موردون موثقون',
    latest_requests: 'أحدث طلبات الشراء', featured: 'مميز',
    view_all: 'عرض الكل', price: 'السعر', currency: 'العملة', moq: 'أقل كمية',
    inventory: 'المخزون', unit: 'الوحدة', seller: 'البائع', buyer: 'المشتري',
    verified: 'موثق', rating: 'التقييم', reviews: 'تقييم',
    contact_seller: 'تواصل مع المورد', chat: 'محادثة', request_quote: 'طلب عرض سعر',
    request_sample: 'طلب عينة', add_cart: 'أضف للسلة', buy_now: 'اشترِ الآن',
    bookmark: 'حفظ', share: 'مشاركة', report: 'إبلاغ',
    description: 'الوصف', details: 'المواصفات', similar: 'منتجات مشابهة',
    other_products: 'منتجات أخرى للبائع', location: 'الموقع',
    save: 'حفظ', cancel: 'إلغاء', submit: 'إرسال', next: 'التالي', back: 'السابق',
    delete: 'حذف', edit: 'تعديل', status: 'الحالة', actions: 'إجراءات',
    empty: 'لا توجد نتائج', loading: 'جارٍ التحميل…',
    footer_about: 'ميدان سوق دولي ثنائي الجانب يجمع تجارة الجملة والتجزئة والتصدير في منصة واحدة موثوقة.',
    rights: 'جميع الحقوق محفوظة.',
    theme: 'السمة', language: 'اللغة',
  },
};

const LOCALES = Object.keys(DICT);

function t(locale, key) {
  const d = DICT[locale] || DICT.fa;
  return d[key] || DICT.en[key] || key;
}
function dir(locale) { return (DICT[locale] || DICT.fa).dir; }
function localeName(locale) { return (DICT[locale] || DICT.fa).name; }

function fmtNumber(locale, n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const map = { fa: 'fa-IR', en: 'en-US', tr: 'tr-TR', ar: 'ar-EG' };
  try { return new Intl.NumberFormat(map[locale] || 'en-US').format(n); }
  catch { return String(n); }
}
function fmtMoney(locale, amount, currency) {
  if (amount === null || amount === undefined) return '—';
  const map = { fa: 'fa-IR', en: 'en-US', tr: 'tr-TR', ar: 'ar-EG' };
  try {
    return new Intl.NumberFormat(map[locale] || 'en-US', {
      style: 'currency', currency: currency || 'TRY', maximumFractionDigits: 0,
    }).format(amount);
  } catch { return `${fmtNumber(locale, amount)} ${currency || ''}`; }
}
function fmtDate(locale, iso) {
  if (!iso) return '—';
  const map = { fa: 'fa-IR', en: 'en-GB', tr: 'tr-TR', ar: 'ar-EG' };
  try { return new Intl.DateTimeFormat(map[locale] || 'en-GB', { dateStyle: 'medium' }).format(new Date(iso.replace(' ', 'T') + 'Z')); }
  catch { return iso; }
}

/** Pick a localized column value from a DB row, e.g. name_fa / name_en. */
function pick(row, base, locale, fallback = 'en') {
  if (!row) return '';
  return row[`${base}_${locale}`] || row[`${base}_${fallback}`] || row[`${base}_fa`] || row[base] || '';
}

module.exports = { DICT, LOCALES, t, dir, localeName, fmtNumber, fmtMoney, fmtDate, pick };
