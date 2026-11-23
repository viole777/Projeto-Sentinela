-- Controlled internal validation workflow for billing batches.
-- This is an administrative consistency check, not an official AIH/BPA/APAC validator.

ALTER TABLE billing_batches
  ADD COLUMN IF NOT EXISTS validation_summary JSONB,
  ADD COLUMN IF NOT EXISTS validated_by TEXT,
  ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_billing_batches_unit_status_competence
  ON billing_batches(unit_id,status,competence DESC);

INSERT INTO permissions(name) VALUES ('billing.validate')
ON CONFLICT(name) DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id
FROM roles r
JOIN permissions p ON r.name='direcao' AND p.name='billing.validate'
ON CONFLICT DO NOTHING;
