-- Sentinela clinical platform expansion — idempotent migration.
-- Apply explicitly with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/20261112_clinical_platform.sql
-- Reference data and external services remain unavailable until their official datasets/contracts are loaded.

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS unit_id TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS professional TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS specialty TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'scheduled';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS appointment_mode TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS created_by TEXT;
CREATE INDEX IF NOT EXISTS idx_appointments_unit_schedule ON appointments(unit_id,scheduled_at);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS cns VARCHAR(15);
ALTER TABLE beds ADD COLUMN IF NOT EXISTS unit_id TEXT;
ALTER TABLE wards ADD COLUMN IF NOT EXISTS unit_id TEXT;
ALTER TABLE hospitalizations ADD COLUMN IF NOT EXISTS unit_id TEXT;
CREATE INDEX IF NOT EXISTS idx_beds_unit_status ON beds(unit_id,status);
CREATE INDEX IF NOT EXISTS idx_hospitalizations_unit ON hospitalizations(unit_id,admitted_at DESC);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS unit_id TEXT;
CREATE INDEX IF NOT EXISTS idx_patients_unit_id ON patients(unit_id);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS sex_at_birth TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS gender_identity TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS race_color TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS mother_name TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS municipality_code TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS cnes_origin TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_cns_unique ON patients(cns) WHERE cns IS NOT NULL AND cns <> '';

CREATE TABLE IF NOT EXISTS professional_registry (
  id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL UNIQUE REFERENCES users(id),
  cns VARCHAR(15) NOT NULL,
  cbo VARCHAR(6) NOT NULL,
  council_type TEXT,
  council_number TEXT,
  council_state CHAR(2),
  cnes VARCHAR(7),
  unit_id TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT professional_cns_format CHECK (cns ~ '^[0-9]{15}$'),
  CONSTRAINT professional_cbo_format CHECK (cbo ~ '^[0-9]{6}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_professional_registry_cns ON professional_registry(cns);
CREATE INDEX IF NOT EXISTS idx_professional_registry_cbo ON professional_registry(cbo);

CREATE TABLE IF NOT EXISTS clinical_records (
  id BIGSERIAL PRIMARY KEY,
  resource_type TEXT NOT NULL CHECK (resource_type IN (
    'soap','vitals','diagnosis','prescription','exam_order','document',
    'hospitalization','discharge','maternal_child','chronic_care','immunization',
    'referral','notification','dispensation','billing','patient_identity',
    'signature_request','nursing_evolution','care_plan','prescription_validation','exam_result'
  )),
  patient_cpf VARCHAR(11),
  unit_id TEXT NOT NULL,
  sector_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  data JSONB NOT NULL,
  created_by TEXT NOT NULL,
  created_by_role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  supersedes_id BIGINT REFERENCES clinical_records(id),
  CONSTRAINT clinical_records_data_object CHECK (jsonb_typeof(data) = 'object')
);
CREATE INDEX IF NOT EXISTS idx_clinical_records_patient_type_created
  ON clinical_records(patient_cpf, resource_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clinical_records_unit_type_created
  ON clinical_records(unit_id, resource_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clinical_records_status ON clinical_records(status);


CREATE OR REPLACE FUNCTION sentinela_reject_clinical_record_mutation()
RETURNS trigger LANGUAGE plpgsql AS $trigger$
BEGIN
  RAISE EXCEPTION 'clinical records are immutable; append a correction record';
END;
$trigger$;
DROP TRIGGER IF EXISTS clinical_records_immutable ON clinical_records;
CREATE TRIGGER clinical_records_immutable BEFORE UPDATE OR DELETE ON clinical_records
FOR EACH ROW EXECUTE FUNCTION sentinela_reject_clinical_record_mutation();


-- Legacy audit log is append-only as well. New events must be inserted;
-- corrections/retention use a separate governed archive, never UPDATE/DELETE.
CREATE OR REPLACE FUNCTION sentinela_reject_legacy_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $
BEGIN
  RAISE EXCEPTION 'audit logs are append-only';
END;
$;
DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs;
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION sentinela_reject_legacy_audit_mutation();

CREATE TABLE IF NOT EXISTS clinical_audit_events (
  id BIGSERIAL PRIMARY KEY,
  actor_username TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create','read','update','export','sign_request','access_denied')),
  resource_type TEXT NOT NULL,
  resource_id BIGINT,
  patient_ref_hash CHAR(64),
  request_id TEXT,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  happened_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE clinical_audit_events DROP CONSTRAINT IF EXISTS clinical_audit_events_action_check;
ALTER TABLE clinical_audit_events ADD CONSTRAINT clinical_audit_events_action_check CHECK (action IN ('create','read','update','export','sign_request','access_denied'));
CREATE INDEX IF NOT EXISTS idx_clinical_audit_patient_hash ON clinical_audit_events(patient_ref_hash, happened_at DESC);
CREATE INDEX IF NOT EXISTS idx_clinical_audit_actor ON clinical_audit_events(actor_username, happened_at DESC);
CREATE INDEX IF NOT EXISTS idx_clinical_audit_unit ON clinical_audit_events(unit_id, happened_at DESC);

CREATE OR REPLACE FUNCTION sentinela_reject_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'clinical audit events are append-only';
END;
$$;
DROP TRIGGER IF EXISTS clinical_audit_no_update ON clinical_audit_events;
CREATE TRIGGER clinical_audit_no_update BEFORE UPDATE OR DELETE ON clinical_audit_events
FOR EACH ROW EXECUTE FUNCTION sentinela_reject_audit_mutation();

CREATE TABLE IF NOT EXISTS official_catalog_entries (
  id BIGSERIAL PRIMARY KEY,
  catalog TEXT NOT NULL CHECK (catalog IN ('CID10','CIAP2','SIGTAP','RENAME','CBO','CNES')),
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  source_version TEXT NOT NULL,
  effective_from DATE,
  effective_to DATE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(catalog, code, source_version)
);
CREATE INDEX IF NOT EXISTS idx_official_catalog_lookup
  ON official_catalog_entries(catalog, code);

CREATE TABLE IF NOT EXISTS external_integration_registry (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL UNIQUE CHECK (provider IN ('CADSUS','GOVBR','ICP_BRASIL','SINAN','ESUS_NOTIFICA','SIA_SUS','SIH_SUS')),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  endpoint_configured BOOLEAN NOT NULL DEFAULT FALSE,
  credentials_configured BOOLEAN NOT NULL DEFAULT FALSE,
  homologated BOOLEAN NOT NULL DEFAULT FALSE,
  last_verified_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO external_integration_registry(provider) VALUES
 ('CADSUS'),('GOVBR'),('ICP_BRASIL'),('SINAN'),('ESUS_NOTIFICA'),('SIA_SUS'),('SIH_SUS')
ON CONFLICT(provider) DO NOTHING;

CREATE TABLE IF NOT EXISTS patient_consents (

  id BIGSERIAL PRIMARY KEY,
  patient_cpf VARCHAR(11) NOT NULL,
  unit_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  legal_basis TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('granted','revoked','expired')),
  recorded_by TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  evidence_ref TEXT
);
CREATE INDEX IF NOT EXISTS idx_patient_consents_patient ON patient_consents(patient_cpf, recorded_at DESC);
CREATE OR REPLACE FUNCTION sentinela_reject_consent_mutation()
RETURNS trigger LANGUAGE plpgsql AS $trigger$
BEGIN
  RAISE EXCEPTION 'consent history is append-only; record a new consent event';
END;
$trigger$;
DROP TRIGGER IF EXISTS patient_consents_immutable ON patient_consents;
CREATE TRIGGER patient_consents_immutable BEFORE UPDATE OR DELETE ON patient_consents
FOR EACH ROW EXECUTE FUNCTION sentinela_reject_consent_mutation();

CREATE TABLE IF NOT EXISTS medication_lots (
  id BIGSERIAL PRIMARY KEY,
  medication_code TEXT,
  medication_name TEXT NOT NULL,
  batch_number TEXT NOT NULL,
  manufacturer TEXT,
  expires_on DATE NOT NULL,
  quantity_available NUMERIC(14,3) NOT NULL CHECK (quantity_available >= 0),
  unit_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(medication_name, batch_number, unit_id)
);
CREATE INDEX IF NOT EXISTS idx_medication_lots_fefo ON medication_lots(unit_id, expires_on, medication_name);

CREATE TABLE IF NOT EXISTS medication_interaction_catalog (
  id BIGSERIAL PRIMARY KEY,
  medication_code_a TEXT NOT NULL,
  medication_code_b TEXT NOT NULL,
  severity TEXT NOT NULL,
  description TEXT NOT NULL,
  source_version TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(medication_code_a, medication_code_b, source_version)
);
CREATE INDEX IF NOT EXISTS idx_medication_interaction_codes
  ON medication_interaction_catalog(medication_code_a, medication_code_b);

CREATE TABLE IF NOT EXISTS medication_dispensing_events (
  id BIGSERIAL PRIMARY KEY,
  prescription_record_id BIGINT NOT NULL REFERENCES clinical_records(id),
  lot_id BIGINT NOT NULL REFERENCES medication_lots(id),
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  dispensed_by TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  dispensed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS signature_provider_events (
  id BIGSERIAL PRIMARY KEY,
  clinical_record_id BIGINT NOT NULL REFERENCES clinical_records(id),
  provider TEXT NOT NULL CHECK (provider IN ('GOVBR','ICP_BRASIL')),
  status TEXT NOT NULL CHECK (status IN ('pending_provider','provider_confirmed','rejected','revoked')),
  provider_reference TEXT,
  payload_digest CHAR(64) NOT NULL,
  requested_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS referral_destinations (
  id BIGSERIAL PRIMARY KEY,
  unit_id TEXT NOT NULL,
  destination_name TEXT NOT NULL,
  destination_cnes VARCHAR(7),
  specialty TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS billing_batches (
  id BIGSERIAL PRIMARY KEY,
  unit_id TEXT NOT NULL,
  instrument TEXT NOT NULL CHECK (instrument IN ('BPA-C','BPA-I','AIH','APAC')),
  competence CHAR(6) NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_validation','validated','exported','rejected')),
  record_ids BIGINT[] NOT NULL DEFAULT '{}',
  layout_version TEXT,
  export_digest CHAR(64),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Permission catalog additions are harmless until the role matrix below grants them.
INSERT INTO roles(name) VALUES ('supervisor_cadastro') ON CONFLICT(name) DO NOTHING;
INSERT INTO permissions(name) VALUES
 ('patients.identity.read'),('patients.identity.write'),('patients.identity.sensitive.write'),
 ('records.write'),('records.sign'),
 ('appointments.manage'),('maternal.read'),('maternal.write'),
 ('chronic.read'),('chronic.write'),('immunizations.read'),('immunizations.write'),
 ('referrals.read'),('referrals.write'),('notifications.write'),
 ('billing.read'),('billing.write'),('integration.manage'),
 ('professionals.registry.write'),('clinical.catalogs.read'),
 ('clinical.audit.read'),('nursing.write'),('careplans.write'),('beds.manage')
ON CONFLICT(name) DO NOTHING;

-- Reconcile only built-in roles. This is the source of truth and revokes stale grants.
BEGIN;
DELETE FROM role_permissions
WHERE role_id IN (SELECT id FROM roles WHERE name IN (
 'admin','cardiologist','medico','enfermagem','triagem','farmacia','atendimento','recepcao','supervisor_cadastro','direcao'
));
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON
 (r.name='admin' AND p.name IN (
  'dashboard.read','users.read','users.write','professionals.read','professionals.write',
  'professionals.registry.write','roles.read','roles.write','permissions.read','units.read','units.write',
  'settings.manage','modules.manage','safety.configure','audit.read',
  'reports.read','integration.manage','clinical.catalogs.read'
 )) OR
 (r.name IN ('cardiologist','medico') AND p.name IN (
  'dashboard.read','patients.read','patients.write','patients.identity.read','records.read','records.write',
  'records.sign','appointments.read','appointments.manage','consultations.queue.read','consultations.read',
  'consultations.write','consultations.finalize','exams.read','exams.write','exams.results.write',
  'prescriptions.read','prescriptions.write','prescriptions.validate','alerts.read','alerts.resolve',
  'ai.read','audit.read','clinical.audit.read','reports.read','medications.read','inventory.read',
  'beds.read','hospitalizations.read','hospitalizations.write','homecare.read','homecare.write',
  'homecare.complete','files.read','queue.call','maternal.read','maternal.write','chronic.read',
  'chronic.write','immunizations.read','immunizations.write','referrals.read','referrals.write',
  'notifications.write','clinical.catalogs.read','careplans.write'
 )) OR
 (r.name='enfermagem' AND p.name IN (
  'dashboard.read','patients.read','patients.identity.read','records.read','records.write','appointments.read',
  'triage.read','triage.write','triage.close','internacoes.read','internacoes.write',
  'hospitalizations.read','hospitalizations.write','exams.read','alerts.read','beds.read','beds.manage','files.read',
  'queue.call','maternal.read','maternal.write','chronic.read','chronic.write','immunizations.read',
  'immunizations.write','nursing.write','careplans.write','clinical.catalogs.read'
 )) OR
 (r.name='triagem' AND p.name IN (
  'dashboard.read','patients.read','patients.identity.read','patients.identity.write','appointments.read',
  'triage.read','triage.write','triage.close','alerts.read','files.read','queue.call'
 )) OR
 (r.name='farmacia' AND p.name IN (
  'dashboard.read','patients.read','prescriptions.read','prescriptions.dispense','inventory.read',
  'inventory.write','alerts.read','medications.read','purchasing.read','reports.read','files.read',
  'clinical.catalogs.read'
 )) OR
 (r.name IN ('atendimento','recepcao') AND p.name IN (
  'dashboard.read','patients.read','patients.write','patients.identity.read','patients.identity.write',
  'appointments.read','appointments.write','appointments.manage','homecare.read','homecare.write',
  'homecare.complete','files.read','queue.call'
 )) OR
 (r.name='supervisor_cadastro' AND p.name IN (
  'dashboard.read','patients.read','patients.identity.read','patients.identity.write','patients.identity.sensitive.write'
 )) OR
 (r.name='direcao' AND p.name IN (
  'dashboard.read','reports.read','audit.read','clinical.audit.read','billing.read','billing.write','beds.manage','alerts.read',
  'alerts.resolve','inventory.read','users.read','professionals.read','roles.read','units.read'
 ))
ON CONFLICT DO NOTHING;
COMMIT;
