-- Operational modules with module-specific schemas and append-only records.
-- Apply after 20261112_clinical_platform.sql.
CREATE TABLE IF NOT EXISTS operational_module_records (
  id BIGSERIAL PRIMARY KEY,
  module_key TEXT NOT NULL CHECK (module_key IN (
    'incidents','staff_schedules','shift_exchanges','attendance_events',
    'quality_indicators','internal_notifications','internal_announcements',
    'unit_module_settings','unit_parameters','staff_availability',
    'purchasing_requests','infection_surveillance','billing_objections'
  )),
  unit_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  data JSONB NOT NULL CHECK (jsonb_typeof(data)='object'),
  created_by TEXT NOT NULL,
  created_by_role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  supersedes_id BIGINT REFERENCES operational_module_records(id)
);
CREATE INDEX IF NOT EXISTS idx_operational_module_unit_type
  ON operational_module_records(unit_id,module_key,id DESC);
CREATE INDEX IF NOT EXISTS idx_operational_module_status
  ON operational_module_records(unit_id,module_key,status);
CREATE OR REPLACE FUNCTION sentinela_reject_operational_module_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'operational module records are append-only; create a correction record';
END;
$$;
DROP TRIGGER IF EXISTS operational_module_records_immutable ON operational_module_records;
CREATE TRIGGER operational_module_records_immutable
BEFORE UPDATE OR DELETE ON operational_module_records
FOR EACH ROW EXECUTE FUNCTION sentinela_reject_operational_module_mutation();

-- Structured, append-only allergy history scoped to the patient's unit.
ALTER TABLE patient_allergies ADD COLUMN IF NOT EXISTS unit_id TEXT;
ALTER TABLE patient_allergies ADD COLUMN IF NOT EXISTS reaction TEXT;
ALTER TABLE patient_allergies ADD COLUMN IF NOT EXISTS severity TEXT;
ALTER TABLE patient_allergies ADD COLUMN IF NOT EXISTS recorded_by TEXT;
UPDATE patient_allergies pa
SET unit_id = p.unit_id
FROM patients p
WHERE pa.patient_cpf = p.cpf AND pa.unit_id IS NULL AND p.unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patient_allergies_unit_patient
  ON patient_allergies(unit_id,patient_cpf,created_at DESC);
CREATE OR REPLACE FUNCTION sentinela_reject_patient_allergy_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'allergy history is append-only; record a new allergy event';
END;
$$;
DROP TRIGGER IF EXISTS patient_allergies_immutable ON patient_allergies;
CREATE TRIGGER patient_allergies_immutable
BEFORE UPDATE OR DELETE ON patient_allergies
FOR EACH ROW EXECUTE FUNCTION sentinela_reject_patient_allergy_mutation();

-- Unit-scoped inventory and append-only stock movement ledger.
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS unit_id TEXT;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS unit_id TEXT;
CREATE INDEX IF NOT EXISTS idx_inventory_unit_name ON inventory(unit_id,name);
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_unit_name_unique ON inventory(unit_id,name) WHERE unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_movements_unit_created ON inventory_movements(unit_id,created_at DESC);
CREATE OR REPLACE FUNCTION sentinela_reject_inventory_movement_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'inventory movements are append-only';
END;
$$;
DROP TRIGGER IF EXISTS inventory_movements_immutable ON inventory_movements;
CREATE TRIGGER inventory_movements_immutable
BEFORE UPDATE OR DELETE ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION sentinela_reject_inventory_movement_mutation();
