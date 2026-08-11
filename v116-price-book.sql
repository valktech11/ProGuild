-- v116 — Pro price book
-- Each pro maintains their own product/service catalog with unit prices.
-- Applied automatically to estimates when the pro selects a line item.

CREATE TABLE IF NOT EXISTS pro_price_book_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_id       uuid NOT NULL,
  name         text NOT NULL,
  description  text,
  category     text NOT NULL DEFAULT 'general',
  unit         text NOT NULL DEFAULT 'each',
  unit_price   numeric(10,2) NOT NULL DEFAULT 0,
  is_active    boolean NOT NULL DEFAULT true,
  sort_order   int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_book_pro ON pro_price_book_items (pro_id, is_active);

-- Seed common roofing items per pro on first use (optional helper — not auto-run)
-- INSERT INTO pro_price_book_items (pro_id, name, category, unit, unit_price) VALUES ...
