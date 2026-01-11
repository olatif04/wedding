CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  norm_name TEXT NOT NULL,
  allowed_guests INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invites_norm_name ON invites(norm_name);

CREATE TABLE IF NOT EXISTS rsvps (
  invite_id TEXT PRIMARY KEY,
  primary_name TEXT NOT NULL,
  attending INTEGER NOT NULL,
  extra_guest_names TEXT NOT NULL,
  notes TEXT,
  submitted_at TEXT NOT NULL,
  ip TEXT
);
