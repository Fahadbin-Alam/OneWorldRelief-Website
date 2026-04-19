-- Author: Fahadbin Alam (fma52), 4/19/26
-- Mod by Codex, 4/19/26
-- From One World Relief donation backend integration, 4/19/26
CREATE TABLE IF NOT EXISTS charity_donors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS charity_donations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  donor_id INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  payment_method TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_payment_id TEXT,
  provider_order_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  campaign TEXT,
  note TEXT,
  metadata_json TEXT,
  receipt_number TEXT UNIQUE,
  tax_year INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  paid_at TEXT,
  FOREIGN KEY (donor_id) REFERENCES charity_donors(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS charity_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  donation_id INTEGER UNIQUE NOT NULL,
  receipt_number TEXT UNIQUE NOT NULL,
  donor_name TEXT NOT NULL,
  donor_email TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  receipt_text TEXT NOT NULL,
  email_status TEXT NOT NULL DEFAULT 'queued',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (donation_id) REFERENCES charity_donations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS charity_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  donation_id INTEGER,
  event_type TEXT NOT NULL,
  event_payload TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (donation_id) REFERENCES charity_donations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_charity_donations_paid_at ON charity_donations(paid_at);
CREATE INDEX IF NOT EXISTS idx_charity_donations_status ON charity_donations(status);
CREATE INDEX IF NOT EXISTS idx_charity_donations_tax_year ON charity_donations(tax_year);
CREATE INDEX IF NOT EXISTS idx_charity_donors_email ON charity_donors(email);
