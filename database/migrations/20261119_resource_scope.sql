CREATE TABLE IF NOT EXISTS institutions (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sectors (
  id BIGSERIAL PRIMARY KEY,
  institution_code TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(unit_id, code)
);

CREATE TABLE IF NOT EXISTS care_team_assignments (
  id BIGSERIAL PRIMARY KEY,
  patient_cpf VARCHAR(11) NOT NULL,
  username TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  sector_id TEXT,
  role TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  UNIQUE(patient_cpf, username, unit_id)
);

CREATE INDEX IF NOT EXISTS idx_care_team_patient_unit
  ON care_team_assignments(patient_cpf, unit_id, active);
CREATE INDEX IF NOT EXISTS idx_care_team_user_unit
  ON care_team_assignments(username, unit_id, active);

CREATE TABLE IF NOT EXISTS patient_resource_access (
  id BIGSERIAL PRIMARY KEY,
  patient_cpf VARCHAR(11) NOT NULL,
  username TEXT NOT NULL,
  permission TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  sector_id TEXT,
  granted_by TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE(patient_cpf, username, permission, unit_id)
);
