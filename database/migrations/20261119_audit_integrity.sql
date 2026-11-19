-- Add algorithm versioning for the legacy audit hash chain.
-- Existing rows retain version 1; new appendAudit writes use canonical version 2.
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS hash_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_hash_version_check;
ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_hash_version_check CHECK (hash_version IN (1,2));

-- Block broad-role mutation grants in addition to the append-only trigger.
REVOKE UPDATE, DELETE ON TABLE audit_logs FROM PUBLIC;
REVOKE UPDATE, DELETE ON TABLE clinical_audit_events FROM PUBLIC;
