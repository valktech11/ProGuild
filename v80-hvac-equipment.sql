-- v80-hvac-equipment.sql
-- Run on staging first, then production

CREATE TABLE IF NOT EXISTS hvac_equipment (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id UUID REFERENCES pros(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  equipment_type TEXT NOT NULL, -- AC_Unit, Furnace, Heat_Pump, Air_Handler, Mini_Split, Boiler, Other
  brand VARCHAR(100),
  model_number VARCHAR(100),
  serial_number VARCHAR(100),
  installation_date DATE,
  warranty_expiry DATE,
  filter_size VARCHAR(50),
  last_service_date DATE,
  next_service_date DATE,
  refrigerant_type TEXT, -- R-22, R-410A, R-32, R-454B, R-407C
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hvac_equipment_pro_id ON hvac_equipment(pro_id);
CREATE INDEX IF NOT EXISTS idx_hvac_equipment_client_id ON hvac_equipment(client_id);
CREATE INDEX IF NOT EXISTS idx_hvac_equipment_next_service ON hvac_equipment(next_service_date) WHERE next_service_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS hvac_refrigerant_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  pro_id UUID REFERENCES pros(id) ON DELETE CASCADE NOT NULL,
  equipment_id UUID REFERENCES hvac_equipment(id) ON DELETE SET NULL,
  refrigerant_type TEXT NOT NULL,
  amount_added_lbs DECIMAL(6,2),
  amount_recovered_lbs DECIMAL(6,2),
  cylinder_id VARCHAR(50),
  leak_detected BOOLEAN DEFAULT false,
  technician_cert_number VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hvac_ref_log_pro_id ON hvac_refrigerant_log(pro_id);
CREATE INDEX IF NOT EXISTS idx_hvac_ref_log_invoice_id ON hvac_refrigerant_log(invoice_id);

CREATE TABLE IF NOT EXISTS hvac_maintenance_reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id UUID REFERENCES pros(id) ON DELETE CASCADE NOT NULL,
  equipment_id UUID REFERENCES hvac_equipment(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  due_date DATE NOT NULL,
  status TEXT DEFAULT 'Pending', -- Pending, Notified, Scheduled, Dismissed
  notified_at TIMESTAMPTZ,
  scheduled_lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hvac_reminders_pro_id ON hvac_maintenance_reminders(pro_id);
CREATE INDEX IF NOT EXISTS idx_hvac_reminders_due_date ON hvac_maintenance_reminders(due_date) WHERE status = 'Pending';
