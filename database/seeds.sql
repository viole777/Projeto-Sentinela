-- Seeds mínimos do Sentinela
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
