-- Purchasing and professional scheduling domain migration.
-- Safe to re-run: tables and indexes are idempotent; role grants are additive.

CREATE TABLE IF NOT EXISTS purchase_requests (
 id BIGSERIAL PRIMARY KEY,
 unit_id TEXT NOT NULL,
 item_name TEXT NOT NULL CHECK (length(btrim(item_name)) BETWEEN 2 AND 200),
 quantity NUMERIC(14,3) NOT NULL CHECK (quantity>0),
 priority TEXT NOT NULL CHECK (priority IN ('routine','urgent','critical')),
 justification TEXT NOT NULL CHECK (length(btrim(justification)) BETWEEN 5 AND 2000),
 status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','rejected')),
 requested_by TEXT NOT NULL,
 requested_by_role TEXT NOT NULL,
 decision_by TEXT,
 decision_reason TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 decided_at TIMESTAMPTZ,
 CHECK ((status='submitted' AND decision_by IS NULL AND decided_at IS NULL) OR
        (status IN ('approved','rejected') AND decision_by IS NOT NULL AND decided_at IS NOT NULL)),
 CHECK (decision_by IS NULL OR decision_by<>requested_by OR status='submitted')
);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_unit_status_created
 ON purchase_requests(unit_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS professional_shifts (
 id BIGSERIAL PRIMARY KEY,
 unit_id TEXT NOT NULL,
 professional_id BIGINT NOT NULL REFERENCES professional_registry(id),
 sector TEXT NOT NULL CHECK (length(btrim(sector)) BETWEEN 1 AND 120),
 starts_at TIMESTAMPTZ NOT NULL,
 ends_at TIMESTAMPTZ NOT NULL,
 status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','confirmed','coverage_needed','completed','cancelled')),
 notes TEXT CHECK (notes IS NULL OR length(notes)<=1000),
 status_reason TEXT,
 created_by TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK (ends_at>starts_at AND ends_at<=starts_at+INTERVAL '24 hours')
);
CREATE INDEX IF NOT EXISTS idx_professional_shifts_unit_start
 ON professional_shifts(unit_id,starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_professional_shifts_professional_start
 ON professional_shifts(professional_id,starts_at,ends_at)
 WHERE status IN ('planned','confirmed','coverage_needed');

INSERT INTO permissions(name) VALUES
 ('purchasing.write'),('purchasing.approve'),('professionals.schedule.write')
ON CONFLICT(name) DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON
 (r.name='farmacia' AND p.name='purchasing.write') OR
 (r.name='direcao' AND p.name IN ('purchasing.approve','professionals.schedule.write'))
ON CONFLICT DO NOTHING;
