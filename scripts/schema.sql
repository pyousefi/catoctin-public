CREATE TABLE IF NOT EXISTS photos (
  id uuid PRIMARY KEY,
  year integer NOT NULL CHECK (year IN (2026, 2025, 2024, 2010)),
  name text NOT NULL,
  contributor text NOT NULL,
  caption text NOT NULL DEFAULT '',
  size bigint NOT NULL CHECK (size > 0 AND size <= 209715200),
  content_type text NOT NULL,
  pathname text NOT NULL UNIQUE,
  session_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'archived')),
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  transferred_at timestamptz
);
CREATE INDEX IF NOT EXISTS photos_year_created ON photos(year, created_at DESC);
CREATE TABLE IF NOT EXISTS rate_limits (
  key text PRIMARY KEY,
  attempts integer NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS storage_budget (
  id integer PRIMARY KEY CHECK (id = 1),
  reserved_bytes bigint NOT NULL DEFAULT 0
);
INSERT INTO storage_budget(id) VALUES (1) ON CONFLICT DO NOTHING;
