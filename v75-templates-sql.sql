-- ============================================================
-- v75-templates-sql.sql
-- Run on STAGING first, then PRODUCTION after QA
-- ============================================================

CREATE TABLE IF NOT EXISTS estimate_templates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_id     uuid NOT NULL REFERENCES pros(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS estimate_template_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES estimate_templates(id) ON DELETE CASCADE,
  sort_order  integer NOT NULL DEFAULT 0,
  name        text NOT NULL,
  description text,
  qty         numeric(10,2) NOT NULL DEFAULT 1,
  unit_price  numeric(10,2) NOT NULL DEFAULT 0,
  amount      numeric(10,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_est_templates_pro  ON estimate_templates(pro_id);
CREATE INDEX IF NOT EXISTS idx_est_tpl_items_tpl  ON estimate_template_items(template_id);

ALTER TABLE estimate_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY tpl_select ON estimate_templates FOR SELECT USING (pro_id = auth.uid());
CREATE POLICY tpl_insert ON estimate_templates FOR INSERT WITH CHECK (pro_id = auth.uid());
CREATE POLICY tpl_delete ON estimate_templates FOR DELETE USING (pro_id = auth.uid());

CREATE POLICY tpl_items_select ON estimate_template_items FOR SELECT USING (
  template_id IN (SELECT id FROM estimate_templates WHERE pro_id = auth.uid()));
CREATE POLICY tpl_items_insert ON estimate_template_items FOR INSERT WITH CHECK (
  template_id IN (SELECT id FROM estimate_templates WHERE pro_id = auth.uid()));
CREATE POLICY tpl_items_delete ON estimate_template_items FOR DELETE USING (
  template_id IN (SELECT id FROM estimate_templates WHERE pro_id = auth.uid()));
