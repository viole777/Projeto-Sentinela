ALTER TABLE patients ADD COLUMN IF NOT EXISTS cpf_encrypted TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS cpf_blind_index CHAR(64);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS cns_encrypted TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS phone_encrypted TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS address_encrypted TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_cpf_blind_unit
  ON patients(cpf_blind_index, unit_id)
  WHERE cpf_blind_index IS NOT NULL;
