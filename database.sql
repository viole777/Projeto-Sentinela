-- Sentinela — Hospital de Cardiologia · SCHEMA ÚNICO PostgreSQL
-- (tabelas + seeds + índices — substitui database/schema.sql e database/schema2.sql)
-- Supabase/Render: psql $DATABASE_URL -f database.sql
-- Depois: DATABASE_URL=... node database/migrate-json-to-postgres.js

CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INT REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  name TEXT,
  password_hash TEXT NOT NULL,
  role_id INT REFERENCES roles(id),
  role TEXT,
  unit TEXT,
  theme TEXT DEFAULT 'light',
  active BOOLEAN DEFAULT TRUE,
  must_change_password BOOLEAN DEFAULT FALSE,
  reset_token TEXT,
  reset_expires TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- O backend limpa sessões vencidas a cada 30s (purge); sem índice essa
-- varredura vira full scan conforme a tabela cresce.
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS patients (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  cpf TEXT UNIQUE NOT NULL,
  patient_type TEXT,
  perfil JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'triagem',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patient_allergies (
  id SERIAL PRIMARY KEY,
  patient_cpf TEXT REFERENCES patients(cpf) ON DELETE CASCADE,
  allergy TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patient_conditions (
  id SERIAL PRIMARY KEY,
  patient_cpf TEXT REFERENCES patients(cpf) ON DELETE CASCADE,
  condition TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS appointments (
  id SERIAL PRIMARY KEY,
  patient_cpf TEXT REFERENCES patients(cpf),
  patient_name TEXT,
  appointment_type TEXT,
  image_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS triage (
  id SERIAL PRIMARY KEY,
  patient_cpf TEXT REFERENCES patients(cpf),
  patient_name TEXT,
  vital_signs JSONB DEFAULT '{}'::jsonb,
  allergy TEXT,
  risk TEXT DEFAULT 'verde',
  status TEXT DEFAULT 'aguardando_medico',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS consultations (
  id SERIAL PRIMARY KEY,
  patient_cpf TEXT REFERENCES patients(cpf),
  patient_name TEXT,
  diagnosis TEXT,
  medication TEXT,
  notes TEXT,
  safety JSONB DEFAULT '[]'::jsonb,
  dispensed BOOLEAN DEFAULT FALSE,
  dispensed_by TEXT,
  dispensed_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exams (
  id SERIAL PRIMARY KEY,
  patient_cpf TEXT REFERENCES patients(cpf),
  patient_name TEXT,
  exam_type TEXT NOT NULL,
  observation TEXT,
  status TEXT DEFAULT 'pending',
  requested_by TEXT,
  requested_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_results (
  id SERIAL PRIMARY KEY,
  exam_id INT UNIQUE REFERENCES exams(id) ON DELETE CASCADE,
  resultado JSONB DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS atendimentos_casa (
  id SERIAL PRIMARY KEY,
  patient_cpf TEXT REFERENCES patients(cpf),
  patient_name TEXT,
  endereco TEXT,
  motivo TEXT,
  observacoes TEXT,
  data_atendimento TEXT,
  status TEXT DEFAULT 'agendado',
  criado_por TEXT,
  concluido_por TEXT,
  concluido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tv_calls (
  id BIGINT PRIMARY KEY,
  patient_cpf TEXT,
  patient_name TEXT,
  guiche TEXT,
  local_type TEXT,
  local_number TEXT,
  called_at TIMESTAMPTZ DEFAULT NOW(),
  called_by TEXT,
  is_current BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS medications (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  high_risk BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS prescriptions (
  id SERIAL PRIMARY KEY,
  consultation_id INT REFERENCES consultations(id),
  patient_cpf TEXT,
  items JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  quantity INT DEFAULT 0,
  min_stock INT DEFAULT 10,
  high_risk BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id SERIAL PRIMARY KEY,
  inventory_id INT REFERENCES inventory(id),
  kind TEXT NOT NULL,
  qty INT NOT NULL,
  reason TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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

-- ============================================================
-- UPGRADE DE BASES ANTIGAS (idempotente — no-op em bases novas)
-- Colunas adicionadas ao longo do tempo; mantém um banco
-- Supabase existente alinhado com o código atual.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'light';
ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires TIMESTAMPTZ;

ALTER TABLE patients ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS image_path TEXT;

ALTER TABLE triage ADD COLUMN IF NOT EXISTS created_by TEXT;

ALTER TABLE consultations ADD COLUMN IF NOT EXISTS dispensed BOOLEAN DEFAULT FALSE;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS dispensed_by TEXT;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS dispensed_at TIMESTAMPTZ;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS created_by TEXT;

ALTER TABLE exams ADD COLUMN IF NOT EXISTS observation TEXT;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS requested_by TEXT;

ALTER TABLE beds ADD COLUMN IF NOT EXISTS occupied_since TIMESTAMPTZ;

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolved BOOLEAN DEFAULT FALSE;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolved_by TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- ============================================================
-- SEEDS ESSENCIAIS (papéis, permissões, alas e leitos)
-- ============================================================

INSERT INTO roles (name) VALUES
  ('admin'), ('cardiologist'), ('medico'), ('enfermagem'),
  ('triagem'), ('farmacia'), ('atendimento'), ('recepcao'), ('direcao')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (name) VALUES
  ('dashboard.read'), ('patients.read'), ('patients.write'),
  ('appointments.read'), ('appointments.write'),
  ('triage.read'), ('triage.write'),
  ('consultations.read'), ('consultations.write'),
  ('exams.read'), ('exams.write'),
  ('prescriptions.read'), ('prescriptions.write'), ('prescriptions.dispense'),
  ('estoque.read'), ('estoque.write'),
  ('internacoes.read'), ('internacoes.write'),
  ('alerts.read'), ('alerts.resolve'),
  ('ai.read'), ('audit.read'), ('reports.read')
ON CONFLICT (name) DO NOTHING;

-- role_permissions: mesmo mapa do ROLE_PERMISSIONS em backend/src/db.js
-- (admin recebe todas; os demais recebem exatamente as permissões do cargo).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON
  (r.name = 'admin') OR
  (r.name IN ('cardiologist', 'medico') AND p.name IN (
    'dashboard.read','patients.read','patients.write','appointments.read','triage.read',
    'consultations.read','consultations.write','exams.read','exams.write',
    'prescriptions.read','prescriptions.write','alerts.read','alerts.resolve',
    'ai.read','audit.read','reports.read')) OR
  (r.name = 'enfermagem' AND p.name IN (
    'dashboard.read','patients.read','appointments.read','triage.read','triage.write',
    'internacoes.read','internacoes.write','exams.read','alerts.read')) OR
  (r.name = 'triagem' AND p.name IN (
    'dashboard.read','patients.read','appointments.read','triage.read','triage.write','alerts.read')) OR
  (r.name = 'farmacia' AND p.name IN (
    'dashboard.read','patients.read','prescriptions.read','prescriptions.dispense',
    'estoque.read','estoque.write','alerts.read')) OR
  (r.name IN ('atendimento','recepcao') AND p.name IN (
    'dashboard.read','patients.read','patients.write','appointments.read','appointments.write')) OR
  (r.name = 'direcao' AND p.name IN (
    'dashboard.read','reports.read','audit.read','patients.read','alerts.read'))
ON CONFLICT DO NOTHING;

INSERT INTO wards (name) VALUES ('CARDIOLOGIA'), ('UTI CARDIOVASCULAR')
ON CONFLICT (name) DO NOTHING;

INSERT INTO beds (code, ward_id, status)
SELECT c, w.id, 'free' FROM (VALUES ('101'), ('102'), ('103'), ('104'), ('105')) AS t(c)
JOIN wards w ON w.name = 'CARDIOLOGIA'
ON CONFLICT (code) DO NOTHING;

INSERT INTO beds (code, ward_id, status)
SELECT 'UTI-201', w.id, 'free' FROM wards w WHERE w.name = 'UTI CARDIOVASCULAR'
ON CONFLICT (code) DO NOTHING;

INSERT INTO inventory (name, quantity, min_stock, high_risk) VALUES
  ('Dipirona 500mg', 82, 20, FALSE),
  ('Varfarina 5mg', 7, 15, TRUE),
  ('Losartana 50mg', 60, 20, FALSE)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- ÍNDICES DO SENTINELA
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_patients_cpf
ON patients(cpf);

CREATE INDEX IF NOT EXISTS idx_appointments_patient_cpf
ON appointments(patient_cpf);

CREATE INDEX IF NOT EXISTS idx_triage_patient_cpf
ON triage(patient_cpf);

CREATE INDEX IF NOT EXISTS idx_triage_status
ON triage(status);

CREATE INDEX IF NOT EXISTS idx_consultations_patient_cpf
ON consultations(patient_cpf);

CREATE INDEX IF NOT EXISTS idx_exams_patient_cpf
ON exams(patient_cpf);

CREATE INDEX IF NOT EXISTS idx_alerts_patient_cpf
ON alerts(patient_cpf);

CREATE INDEX IF NOT EXISTS idx_hospitalizations_patient_cpf
ON hospitalizations(patient_cpf);

CREATE INDEX IF NOT EXISTS idx_audit_logs_username
ON audit_logs(username);

CREATE INDEX IF NOT EXISTS idx_appointments_created_at
ON appointments(created_at);

CREATE INDEX IF NOT EXISTS idx_consultations_created_at
ON consultations(created_at);

