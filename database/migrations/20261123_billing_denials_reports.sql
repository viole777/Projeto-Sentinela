-- Billing denial tracking and production reporting.
-- This migration stores administrative tracking only; it does not transmit or certify official SUS/TISS files.

CREATE TABLE IF NOT EXISTS billing_denials (
 id BIGSERIAL PRIMARY KEY,
 unit_id TEXT NOT NULL,
 billing_batch_id BIGINT NOT NULL REFERENCES billing_batches(id),
 document_reference TEXT NOT NULL CHECK (length(btrim(document_reference)) BETWEEN 2 AND 120),
 reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 2000),
 disputed_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (disputed_amount >= 0),
 appeal_deadline DATE,
 status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','under_review','appeal_submitted','accepted','rejected')),
 status_reason TEXT,
 created_by TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_billing_denials_unit_status_deadline
 ON billing_denials(unit_id,status,appeal_deadline);
CREATE INDEX IF NOT EXISTS idx_billing_denials_batch
 ON billing_denials(billing_batch_id,created_at DESC);

INSERT INTO permissions(name) VALUES ('billing.write')
ON CONFLICT(name) DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON r.name='direcao' AND p.name='billing.write'
ON CONFLICT DO NOTHING;
