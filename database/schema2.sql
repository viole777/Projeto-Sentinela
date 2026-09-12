CREATE TABLE IF NOT EXISTS wards (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS beds (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  ward_id INT REFERENCES wards(id),
  status TEXT DEFAULT 'free',
  patient_cpf TEXT,
  patient_name TEXT,
  occupied_since TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS hospitalizations (
  id SERIAL PRIMARY KEY,
  patient_cpf TEXT REFERENCES patients(cpf),
  patient_name TEXT,
  bed_code TEXT,
  reason TEXT,
  doctor TEXT,
  admitted_at TIMESTAMPTZ DEFAULT NOW(),
  discharged_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  level TEXT NOT NULL,
  rule TEXT NOT NULL,
  message TEXT NOT NULL,
  patient_cpf TEXT,
  patient_name TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_by TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  happened_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS safety_rules (
  id SERIAL PRIMARY KEY,
  rules JSONB DEFAULT '{}'::jsonb,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS safety_events (
  id SERIAL PRIMARY KEY,
  consultation_id INT,
  findings JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  role TEXT,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  happened_at TIMESTAMPTZ DEFAULT NOW()
);
