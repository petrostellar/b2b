-- ============================================================
-- MYDAN GLOBAL MARKETPLACE — CORE SCHEMA
-- Modular monolith. Domain-grouped tables.
-- SQLite dialect (Postgres-compatible column semantics)
-- ============================================================

PRAGMA foreign_keys = ON;

-- ============ IDENTITY ============
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  phone TEXT UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT,
  display_name TEXT,
  first_name TEXT,
  last_name TEXT,
  avatar TEXT,
  locale TEXT DEFAULT 'fa',
  currency TEXT DEFAULT 'TRY',
  theme TEXT DEFAULT 'luxury',
  active_mode TEXT DEFAULT 'buyer',          -- buyer | seller
  status TEXT DEFAULT 'active',              -- active|suspended|banned|deleted
  is_admin INTEGER DEFAULT 0,
  admin_role TEXT,                           -- super_admin|operations|kyc|moderation|finance|support
  phone_verified INTEGER DEFAULT 0,
  email_verified INTEGER DEFAULT 0,
  two_fa_enabled INTEGER DEFAULT 0,
  trust_score INTEGER DEFAULT 0,
  last_active_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  logo TEXT, cover TEXT,
  business_name TEXT,
  registration_no TEXT,
  tax_no TEXT,
  about TEXT,
  industry TEXT,
  category_id INTEGER REFERENCES categories(id),
  country TEXT, province TEXT, city TEXT, address TEXT,
  lat REAL, lng REAL,
  phone_public INTEGER DEFAULT 0,
  website TEXT,
  social_instagram TEXT, social_linkedin TEXT, social_x TEXT, social_whatsapp TEXT,
  business_hours TEXT,
  seller_type TEXT,        -- manufacturer|distributor|wholesaler|retailer|exporter|importer|service
  export_markets TEXT, import_markets TEXT,
  incoterms TEXT,
  moq_preference TEXT,
  company_video TEXT, catalog_pdf TEXT,
  response_rate INTEGER DEFAULT 0,
  response_time_min INTEGER,
  completion_score INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  ip TEXT, user_agent TEXT, device TEXT,
  event TEXT,  -- login|logout|otp_fail|suspicious
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS otp_challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL, code TEXT NOT NULL,
  purpose TEXT DEFAULT 'login',
  attempts INTEGER DEFAULT 0,
  consumed INTEGER DEFAULT 0,
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_challenges(phone);

CREATE TABLE IF NOT EXISTS personas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  persona TEXT NOT NULL,   -- buyer|seller|wholesaler|manufacturer|...
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, persona)
);

CREATE TABLE IF NOT EXISTS team_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT, role TEXT, email TEXT, phone TEXT, avatar TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============ KYC / KYB ============
CREATE TABLE IF NOT EXISTS kyc_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT DEFAULT 'kyc',  -- kyc|kyb
  status TEXT DEFAULT 'draft', -- draft|submitted|under_review|need_correction|approved|rejected|suspended|expired
  legal_name TEXT, national_id TEXT, birth_date TEXT, country TEXT,
  company_name TEXT, company_reg_no TEXT, company_tax_no TEXT,
  trade_registry TEXT, legal_address TEXT,
  authorized_person TEXT, authorized_person_id TEXT, beneficial_owner TEXT,
  reviewer_id INTEGER REFERENCES users(id),
  review_note TEXT, decision_reason TEXT,
  submitted_at TEXT, decided_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kyc_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL REFERENCES kyc_cases(id) ON DELETE CASCADE,
  doc_type TEXT,  -- id_front|id_back|selfie_declaration|trade_license|tax_cert|other
  file_path TEXT, mime TEXT, size_bytes INTEGER, hash TEXT,
  country TEXT, issue_date TEXT, expiry_date TEXT,
  status TEXT DEFAULT 'pending',
  review_note TEXT,
  version INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kyc_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER REFERENCES kyc_cases(id) ON DELETE CASCADE,
  actor_id INTEGER, from_status TEXT, to_status TEXT, note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============ CATALOG / TAXONOMY ============
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,
  name_fa TEXT, name_en TEXT, name_tr TEXT, name_ar TEXT,
  description TEXT, icon TEXT, image TEXT, banner TEXT,
  sort_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  seo_title TEXT, seo_description TEXT,
  allowed_listing_types TEXT DEFAULT 'wholesale,retail,service',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cat_parent ON categories(parent_id);

CREATE TABLE IF NOT EXISTS attributes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  akey TEXT NOT NULL,
  label_fa TEXT, label_en TEXT, label_tr TEXT, label_ar TEXT,
  data_type TEXT NOT NULL,  -- text|textarea|integer|decimal|boolean|select|multiselect|date|unit_value|color
  options TEXT,             -- JSON array
  unit TEXT,
  required INTEGER DEFAULT 0,
  searchable INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name_fa TEXT, name_en TEXT, name_tr TEXT, name_ar TEXT,
  kind TEXT  -- weight|count|volume|length|area
);

-- ============ LISTINGS ============
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id),
  slug TEXT UNIQUE,
  title TEXT NOT NULL,
  -- Per-locale titles. `title` stays the authoring/source value and is always present;
  -- these are optional overrides resolved at query time (see resolveTitle in catalog.js),
  -- so existing views that print `l.title` keep working unchanged.
  title_fa TEXT, title_en TEXT, title_tr TEXT, title_ar TEXT,
  description_fa TEXT, description_en TEXT, description_tr TEXT, description_ar TEXT,
  listing_type TEXT DEFAULT 'wholesale',  -- wholesale|retail|service|export
  variety TEXT,
  origin_country TEXT, origin_province TEXT, origin_city TEXT,
  measure_unit TEXT,
  inventory REAL DEFAULT 0,
  inventory_unit TEXT,
  low_stock_threshold REAL,
  restock_date TEXT,
  moq REAL, moq_unit TEXT,
  price REAL, currency TEXT DEFAULT 'TRY', price_unit TEXT,
  retail_price REAL, wholesale_price REAL,
  negotiable INTEGER DEFAULT 1,
  price_on_request INTEGER DEFAULT 0,
  tier_pricing TEXT,      -- JSON
  tax_mode TEXT DEFAULT 'excluded',
  lead_time_days INTEGER,
  availability TEXT DEFAULT 'in_stock',
  description TEXT,
  quality TEXT, packaging TEXT, grade TEXT, freshness TEXT,
  storage_method TEXT, maintenance TEXT, dimensions TEXT,
  certifications TEXT, benefits TEXT,
  payment_terms TEXT, delivery_terms TEXT, seller_notes TEXT,
  status TEXT DEFAULT 'draft',   -- draft|incomplete|pending_review|approved|rejected|need_correction|paused|sold_out|expired|archived|suspended
  moderation_reason TEXT,
  wizard_step INTEGER DEFAULT 1,
  boost_rank INTEGER DEFAULT 0,
  boosted_until TEXT,
  is_featured INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,
  saves_count INTEGER DEFAULT 0,
  price_updated_at TEXT,
  published_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_listing_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listing_cat ON listings(category_id);
CREATE INDEX IF NOT EXISTS idx_listing_seller ON listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_listing_boost ON listings(boost_rank DESC, published_at DESC);

CREATE TABLE IF NOT EXISTS listing_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  path TEXT NOT NULL, kind TEXT DEFAULT 'image',
  sort_order INTEGER DEFAULT 0,
  moderation_status TEXT DEFAULT 'approved',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS listing_attributes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  attribute_id INTEGER REFERENCES attributes(id) ON DELETE CASCADE,
  akey TEXT, value TEXT
);

CREATE TABLE IF NOT EXISTS listing_price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  old_price REAL, new_price REAL, currency TEXT, price_unit TEXT,
  reason TEXT, notified INTEGER DEFAULT 0,
  actor_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS listing_inventory_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  old_stock REAL, new_stock REAL, unit TEXT, availability TEXT,
  actor_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS listing_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  from_status TEXT, to_status TEXT, actor_id INTEGER, reason TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============ RFQ / BUY REQUEST / QUOTE ============
CREATE TABLE IF NOT EXISTS buy_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id),
  title TEXT NOT NULL,
  variety TEXT,
  quantity REAL, unit TEXT,
  wholesale_experience INTEGER DEFAULT 0,
  looking_for TEXT,
  target_price REAL, currency TEXT DEFAULT 'TRY',
  origin_preference TEXT, destination TEXT,
  deadline TEXT,
  packaging_requirement TEXT, quality_requirement TEXT, certificate_requirement TEXT,
  description TEXT, attachment TEXT,
  contact_preference TEXT DEFAULT 'chat',
  status TEXT DEFAULT 'draft', -- draft|submitted|pending_review|approved|rejected|matched|negotiating|awarded|closed|expired|cancelled
  rejection_reason TEXT,
  awarded_seller_id INTEGER REFERENCES users(id),
  views_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_br_status ON buy_requests(status);

CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  buy_request_id INTEGER REFERENCES buy_requests(id) ON DELETE CASCADE,
  listing_id INTEGER REFERENCES listings(id) ON DELETE SET NULL,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  price REAL, currency TEXT, unit TEXT, quantity REAL, moq REAL,
  tax REAL DEFAULT 0, shipping REAL DEFAULT 0, incoterm TEXT,
  lead_time_days INTEGER, valid_until TEXT,
  payment_terms TEXT, attachment TEXT,
  seller_note TEXT, buyer_note TEXT,
  version INTEGER DEFAULT 1,
  parent_quote_id INTEGER REFERENCES quotes(id),
  status TEXT DEFAULT 'sent', -- sent|countered|accepted|rejected|expired|awarded
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============ MESSAGING ============
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  a_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  b_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  context_type TEXT, context_id INTEGER,
  last_message TEXT, last_message_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(a_id, b_id, context_type, context_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT, attachment TEXT, attachment_kind TEXT,
  quote_id INTEGER REFERENCES quotes(id),
  read_at TEXT,
  flagged INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, id DESC);

-- ============ CRM / BOOKMARKS ============
CREATE TABLE IF NOT EXISTS saved_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, color TEXT DEFAULT '#C8A15A',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS saved_list_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id INTEGER NOT NULL REFERENCES saved_lists(id) ON DELETE CASCADE,
  target_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'medium', -- low|medium|high|following|no_response|no_need
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(list_id, target_user_id)
);

CREATE TABLE IF NOT EXISTS user_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  list_id INTEGER REFERENCES saved_lists(id) ON DELETE SET NULL,
  body TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL, -- listing|user|buy_request
  target_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS follows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(follower_id, followee_id)
);

CREATE TABLE IF NOT EXISTS saved_searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT, query_json TEXT, alert_enabled INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============ STORY ============
CREATE TABLE IF NOT EXISTS stories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_path TEXT, media_kind TEXT DEFAULT 'image',
  caption TEXT,
  cta_label TEXT, cta_type TEXT, cta_target_id INTEGER,
  status TEXT DEFAULT 'active', -- active|expired|removed|pending
  expires_at TEXT,
  views_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS story_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  viewer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(story_id, viewer_id)
);

-- ============ COMMERCE ============
CREATE TABLE IF NOT EXISTS carts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'open',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cart_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cart_id INTEGER NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  quantity REAL DEFAULT 1,
  unit_price REAL, currency TEXT,
  UNIQUE(cart_id, listing_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT UNIQUE,
  buyer_id INTEGER NOT NULL REFERENCES users(id),
  seller_id INTEGER REFERENCES users(id),
  quote_id INTEGER REFERENCES quotes(id),
  subtotal REAL DEFAULT 0, tax REAL DEFAULT 0, shipping REAL DEFAULT 0,
  discount REAL DEFAULT 0, total REAL DEFAULT 0, currency TEXT DEFAULT 'TRY',
  incoterm TEXT, po_reference TEXT, contract_file TEXT,
  ship_name TEXT, ship_phone TEXT, ship_country TEXT, ship_city TEXT,
  ship_address TEXT, ship_method TEXT,
  status TEXT DEFAULT 'pending_payment',
  payment_status TEXT DEFAULT 'unpaid',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  listing_id INTEGER REFERENCES listings(id),
  title TEXT, quantity REAL, unit_price REAL, line_total REAL, currency TEXT
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT, to_status TEXT, actor_id INTEGER, note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  carrier TEXT, method TEXT, tracking_no TEXT,
  origin TEXT, destination TEXT, weight_kg REAL, volume_m3 REAL,
  package_count INTEGER, eta TEXT, status TEXT DEFAULT 'preparing',
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============ PAYMENTS ============
CREATE TABLE IF NOT EXISTS payment_intents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotency_key TEXT UNIQUE,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  subscription_id INTEGER,
  payer_id INTEGER REFERENCES users(id),
  payee_id INTEGER REFERENCES users(id),
  amount_minor INTEGER NOT NULL,
  currency TEXT DEFAULT 'TRY',
  provider TEXT DEFAULT 'mock',
  provider_ref TEXT,
  status TEXT DEFAULT 'requires_payment', -- requires_payment|processing|succeeded|failed|refunded
  escrow INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance_minor INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'TRY'
);

CREATE TABLE IF NOT EXISTS wallet_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_id INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  direction TEXT, amount_minor INTEGER, currency TEXT,
  reason TEXT, ref_type TEXT, ref_id INTEGER,
  balance_after_minor INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============ SUBSCRIPTION / ENTITLEMENTS ============
CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE, name_fa TEXT, name_en TEXT, name_tr TEXT, name_ar TEXT,
  months INTEGER, price_minor INTEGER, currency TEXT DEFAULT 'TRY',
  discount_percent INTEGER DEFAULT 0, bonus_months INTEGER DEFAULT 0,
  badge TEXT, highlight INTEGER DEFAULT 0, sort_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS plan_features (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  fkey TEXT, label_fa TEXT, label_en TEXT, value TEXT
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  status TEXT DEFAULT 'active', -- pending|active|cancelled|expired
  starts_at TEXT, ends_at TEXT,
  auto_renew INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entitlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ekey TEXT NOT NULL, value TEXT,
  expires_at TEXT,
  UNIQUE(user_id, ekey)
);

-- ============ PROMOTION / ADS ============
CREATE TABLE IF NOT EXISTS boosts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT DEFAULT 'ladder', -- ladder|featured|homepage|sponsored_search
  duration_days INTEGER, price_minor INTEGER, currency TEXT DEFAULT 'TRY',
  starts_at TEXT, ends_at TEXT, status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ad_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name TEXT, placement TEXT, -- hero|category|feed|story|sponsored
  target_category_id INTEGER, target_country TEXT, target_locale TEXT,
  budget_minor INTEGER, model TEXT DEFAULT 'flat', -- cpc|cpm|flat
  image TEXT, headline TEXT, subtext TEXT, link_url TEXT,
  starts_at TEXT, ends_at TEXT,
  status TEXT DEFAULT 'pending', -- pending|active|paused|finished|rejected
  impressions INTEGER DEFAULT 0, clicks INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============ TRUST / REVIEWS / MODERATION ============
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id INTEGER REFERENCES orders(id),
  score INTEGER NOT NULL,
  body TEXT,
  transaction_verified INTEGER DEFAULT 0,
  seller_response TEXT,
  status TEXT DEFAULT 'published', -- published|pending|removed
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER REFERENCES users(id),
  target_type TEXT, target_id INTEGER,
  reason TEXT, details TEXT,
  status TEXT DEFAULT 'open', -- open|reviewing|actioned|dismissed
  resolution TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS disputes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  opener_id INTEGER REFERENCES users(id),
  claim TEXT, evidence TEXT,
  status TEXT DEFAULT 'open', -- open|mediation|decided|refunded|closed
  decision TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============ SUPPORT ============
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  category TEXT, subject TEXT, priority TEXT DEFAULT 'normal',
  status TEXT DEFAULT 'open', -- open|pending|answered|closed
  assignee_id INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_id INTEGER REFERENCES users(id),
  body TEXT, attachment TEXT, internal INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============ ANALYTICS ============
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  actor_id INTEGER,
  target_type TEXT, target_id INTEGER,
  payload TEXT,
  ip TEXT, ua TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_name ON events(name, created_at);

CREATE TABLE IF NOT EXISTS listing_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  viewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  day TEXT,
  source TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lv ON listing_views(listing_id, day);

CREATE TABLE IF NOT EXISTS profile_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  day TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS search_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER, q TEXT, scope TEXT, results INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============ NOTIFICATIONS ============
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT, title TEXT, body TEXT, link TEXT,
  channel TEXT DEFAULT 'in_app',
  read_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at);

CREATE TABLE IF NOT EXISTS notification_prefs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  in_app INTEGER DEFAULT 1, email INTEGER DEFAULT 1, sms INTEGER DEFAULT 0, push INTEGER DEFAULT 1,
  quiet_from TEXT, quiet_to TEXT
);

-- ============ CMS / SEO ============
CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title_fa TEXT, title_en TEXT, title_tr TEXT, title_ar TEXT,
  body_fa TEXT, body_en TEXT, body_tr TEXT, body_ar TEXT,
  seo_title TEXT, seo_description TEXT,
  status TEXT DEFAULT 'published',
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS faqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_name TEXT,
  q_fa TEXT, a_fa TEXT, q_en TEXT, a_en TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS blog_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE, title TEXT, excerpt TEXT, body TEXT, cover TEXT,
  title_fa TEXT, title_en TEXT, title_tr TEXT, title_ar TEXT,
  excerpt_fa TEXT, excerpt_en TEXT, excerpt_tr TEXT, excerpt_ar TEXT,
  author_id INTEGER REFERENCES users(id),
  status TEXT DEFAULT 'published',
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============ LOCALIZATION / PLATFORM ============
CREATE TABLE IF NOT EXISTS languages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE, name TEXT, native_name TEXT, dir TEXT DEFAULT 'ltr',
  enabled INTEGER DEFAULT 1, is_default INTEGER DEFAULT 0, sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  locale TEXT NOT NULL, tkey TEXT NOT NULL, value TEXT,
  UNIQUE(locale, tkey)
);

CREATE TABLE IF NOT EXISTS currencies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE, symbol TEXT, name TEXT,
  rate_to_base REAL DEFAULT 1, enabled INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS countries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE, name_fa TEXT, name_en TEXT, dial_code TEXT, enabled INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS regions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code TEXT, name_fa TEXT, name_en TEXT
);

CREATE TABLE IF NOT EXISTS themes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE, name TEXT,
  tokens_json TEXT,
  enabled INTEGER DEFAULT 1, is_default INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS system_settings (
  skey TEXT PRIMARY KEY,
  svalue TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feature_flags (
  fkey TEXT PRIMARY KEY,
  enabled INTEGER DEFAULT 1,
  description TEXT
);

CREATE TABLE IF NOT EXISTS plugins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id TEXT UNIQUE, name TEXT, version TEXT, author TEXT,
  description TEXT, manifest_json TEXT, settings_json TEXT,
  status TEXT DEFAULT 'installed', -- installed|enabled|disabled|error
  health TEXT DEFAULT 'unknown',
  installed_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER, action TEXT, entity TEXT, entity_id INTEGER,
  before_json TEXT, after_json TEXT, ip TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT, granted INTEGER, version TEXT, ip TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
