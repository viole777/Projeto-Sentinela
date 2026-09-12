-- Sentinela — Hospital de Cardiologia · schema PostgreSQL
-- Render: psql $DATABASE_URL -f database/schema.sql
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
