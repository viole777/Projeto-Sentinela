'use strict';
const assert = require('node:assert/strict');
const { RESOURCE_DEFS, validateResourcePayload, normalizeCpf, classifyIdentityChanges, validatePurchaseRequestPayload, validateProfessionalShiftPayload } = require('../backend/src/routes/clinicalPlatform');
const { ROLE_PERMISSIONS } = require('../backend/src/db');

assert.ok(Object.keys(RESOURCE_DEFS).length >= 17, 'all clinical domains must have explicit resource definitions');
assert.ok(RESOURCE_DEFS.allergies, 'allergy records must have a dedicated resource definition');
assert.ok(RESOURCE_DEFS['medication-administrations'], 'medication administration must have a dedicated resource definition');
assert.equal(validateResourcePayload('allergies',{patientCpf:'12345678900',substance:'Substância',reaction:'Reação',severity:'severe',recordedAt:'2026-11-23'}).ok,true);
assert.equal(validateResourcePayload('allergies',{patientCpf:'12345678900',substance:'Substância',reaction:'Reação',severity:'extreme',recordedAt:'2026-11-23'}).ok,false);
assert.equal(validateResourcePayload('medication-administrations',{patientCpf:'12345678900',prescriptionRecordId:12,administeredAt:'2026-11-23T10:00',outcome:'administered'}).ok,true);
assert.equal(validateResourcePayload('medication-administrations',{patientCpf:'12345678900',prescriptionRecordId:12,administeredAt:'2026-11-23T10:00',outcome:'refused'}).ok,false,'non-administered medication outcomes require a reason');
assert.equal(normalizeCpf('123.456.789-00'),'12345678900');
assert.deepEqual(classifyIdentityChanges(
 {name:'Paciente Atualizado',birthDate:'2000-01-01'},
 {cpf:'12345678900',cns:'123456789012345'}
),{basicFields:['name','birthDate'],sensitiveFields:[]},'basic identity edits must not require elevated authorization');
assert.deepEqual(classifyIdentityChanges(
 {name:'Paciente Atualizado',cns:'987654321098765',newCpf:'98765432100'},
 {cpf:'12345678900',cns:'123456789012345'}
),{basicFields:['name'],sensitiveFields:['cns','cpf']},'CPF and CNS changes must be classified as sensitive');

const soap=validateResourcePayload('soap-notes',{
 patientCpf:'123.456.789-00',subjective:'Queixa relatada',objective:'Dados observados',
 assessment:'Avaliação documentada',plan:'Plano registrado',diagnosisSystem:'CID-10',diagnosisCode:'I10',
 ignoredSecret:'must-not-be-persisted'
});
assert.equal(soap.ok,true);
assert.equal(soap.data.patientCpf,'12345678900');
assert.equal(Object.hasOwn(soap.data,'ignoredSecret'),false,'unknown fields must be discarded');

assert.equal(validateResourcePayload('soap-notes',{patientCpf:'123',subjective:'a'}).ok,false);
assert.equal(validateResourcePayload('soap-notes',{
 patientCpf:'12345678900',subjective:'a',objective:'b',assessment:'c',plan:'d',diagnosisSystem:'ICD-99',diagnosisCode:'X'
}).ok,false,'diagnosis system must be CID-10 or CIAP-2');

assert.equal(validateResourcePayload('vital-signs',{patientCpf:'12345678900',recordedAt:'2026-11-12',oxygenSaturation:101}).ok,false);
assert.equal(validateResourcePayload('vital-signs',{patientCpf:'12345678900',recordedAt:'12/11/2026'}).ok,false);

assert.equal(validateResourcePayload('prescriptions',{
 patientCpf:'12345678900',medicationCode:'123',medicationName:'Medicamento',dose:'1 unidade',route:'oral',frequency:'conforme prescrição',quantity:30
}).ok,true);
assert.equal(validateResourcePayload('billing',{
 instrument:'AIH',competence:'202611',sigtapCode:'0000000000',cboCode:'225125',cidCode:'I10'
}).ok,true);
assert.equal(validateResourcePayload('billing',{
 instrument:'FAKE',competence:'2026-11',sigtapCode:'x',cboCode:'x',cidCode:'x'
}).ok,false);
assert.equal(validateResourcePayload('maternal-child',{
 patientCpf:'12345678900',kind:'prenatal',recordedAt:'2026-11-12'
}).ok,true);
assert.equal(validateResourcePayload('maternal-child',{
 patientCpf:'12345678900',kind:'unknown',recordedAt:'2026-11-12'
}).ok,false);
assert.equal(validateResourcePayload('immunizations',{
 patientCpf:'12345678900',vaccine:'Vacina',dose:'1ª',lot:'L1',manufacturer:'Fabricante',administeredAt:'2026-11-12'
}).ok,true);

assert.ok(ROLE_PERMISSIONS.medico.includes('records.write'));
assert.ok(ROLE_PERMISSIONS.medico.includes('referrals.write'));
assert.ok(ROLE_PERMISSIONS.medico.includes('records.sign'));
assert.ok(ROLE_PERMISSIONS.recepcao.includes('appointments.manage'));
assert.ok(ROLE_PERMISSIONS.recepcao.includes('patients.identity.read'));
assert.ok(ROLE_PERMISSIONS.recepcao.includes('patients.identity.write'));
assert.ok(!ROLE_PERMISSIONS.recepcao.includes('patients.identity.sensitive.write'));
assert.ok(ROLE_PERMISSIONS.supervisor_cadastro.includes('patients.identity.sensitive.write'));
assert.ok(ROLE_PERMISSIONS.direcao.includes('billing.write'));
assert.ok(ROLE_PERMISSIONS.enfermagem.includes('beds.manage'));

const fs=require('node:fs');
const path=require('node:path');
const routerSource=fs.readFileSync(path.join(__dirname,'../backend/src/routes/clinicalPlatform.js'),'utf8');
const migration=fs.readFileSync(path.join(__dirname,'../database/migrations/20261112_clinical_platform.sql'),'utf8');
const purchasingMigration=fs.readFileSync(path.join(__dirname,'../database/migrations/20261123_purchasing_professional_shifts.sql'),'utf8');
const databaseSchema=fs.readFileSync(path.join(__dirname,'../database.sql'),'utf8');
const sessionsTable=databaseSchema.match(/CREATE TABLE IF NOT EXISTS sessions\s*\(([\s\S]*?)\);/i);
assert.ok(sessionsTable,'sessions table must be declared in the canonical schema');
assert.equal((sessionsTable[1].match(/\btoken_hash\b/g)||[]).length,1,'sessions table must define token_hash exactly once');
assert.match(databaseSchema,/CREATE TABLE IF NOT EXISTS patients\s*\([\s\S]*?unit_id TEXT/, 'canonical patient schema must include unit scoping before indexes are created');
const server=fs.readFileSync(path.join(__dirname,'../backend/server.js'),'utf8');
assert.match(routerSource,/WHERE resource_type=\$1 AND unit_id=\$2/, 'clinical record lists must be unit-scoped');
assert.match(routerSource,/patient-summary\/:cpf/, 'patient summary must have a dedicated route');
assert.match(routerSource,/SENSITIVE_IDENTIFIER_PERMISSION_REQUIRED/, 'identifier changes must require elevated authorization');
assert.match(routerSource,/CPF_CHANGE_REQUIRES_RELATIONAL_REKEY/, 'CPF changes must remain blocked until references can be rekeyed safely');
assert.match(routerSource,/audit\(req,client,'access_denied','patient_identity'/, 'denied sensitive identity changes must be audited');
assert.match(routerSource,/audit\(req,client,'update','patient_identity'/, 'successful identity changes must be audited as updates');
assert.match(routerSource,/ORDER BY expires_on ASC,id ASC FOR UPDATE/, 'dispensing must lock FEFO lots');
assert.match(routerSource,/medication_administration/, 'medication administration must be persisted as a clinical record');
assert.match(routerSource,/PRESCRIPTION_NOT_VALIDATED/, 'medication administration must require an approved prescription');
assert.match(routerSource,/status=\$1,patient_cpf=\$2,patient_name=\$3,occupied_since=NOW\(\)/, 'admission must atomically mark the selected bed as occupied');
assert.match(routerSource,/PRESCRIPTION_NOT_VALIDATED/, 'dispensing must require the latest professional validation');
assert.match(routerSource,/ORDER BY id DESC LIMIT 1/, 'validation decision must be resolved from the latest event');
assert.match(routerSource,/SIGNATURE_ADAPTER_UNAVAILABLE/, 'the API must not pretend a digital signature is implemented');
assert.doesNotMatch(routerSource,/status\(501\)/, 'the clinical platform must not emit HTTP 501');
assert.match(routerSource,/OFFICIAL_CATALOG_NOT_LOADED/, 'missing official catalogs must fail explicitly');
assert.match(migration,/clinical_records_immutable/, 'clinical records must be append-only');
assert.match(migration,/clinical_audit_no_update/, 'clinical audit must be append-only');
assert.match(migration,/WHERE role_id IN/, 'migration must reconcile built-in role grants');
assert.match(migration,/patients\.identity\.sensitive\.write/, 'migration must seed the elevated identifier permission');
assert.match(migration,/supervisor_cadastro/, 'migration must provision the dedicated supervisor role');
assert.match(server,/clinicalPlatform\"\)\.createClinicalPlatformRouter/, 'versioned clinical router must be mounted');
assert.ok(!ROLE_PERMISSIONS.medico.includes('triage.read'));
assert.ok(ROLE_PERMISSIONS.farmacia.includes('prescriptions.dispense'));
assert.ok(ROLE_PERMISSIONS.recepcao.includes('patients.identity.write'));
assert.ok(ROLE_PERMISSIONS.admin.includes('integration.manage'));
assert.ok(!ROLE_PERMISSIONS.admin.includes('clinical.audit.read'),'technical admin must not read patient audit trail');

console.log('clinical platform schema validation tests passed');

assert.match(routerSource,/router\.get\('\/api\/v1\/dispensations'/, 'dispensation history must have a dedicated read endpoint');
assert.match(routerSource,/router\.post\('\/api\/v1\/dispensations'/, 'dispensation must have a dedicated workflow endpoint');

assert.ok(RESOURCE_DEFS.incidents, 'incident reporting must have a dedicated resource');
assert.ok(RESOURCE_DEFS.protocols, 'protocol drafts must have a dedicated resource');
assert.equal(validateResourcePayload('incidents',{occurredAt:'2026-11-23T10:00',category:'fall',severity:'moderate',description:'Observed event'}).ok,true);
assert.equal(validateResourcePayload('incidents',{occurredAt:'2026-11-23T10:00',category:'unknown',severity:'moderate',description:'Observed event'}).ok,false);
assert.equal(validateResourcePayload('protocols',{code:'CLIN-01',name:'Protocol',version:'1.0',content:'Draft'}).ok,true);
assert.equal(validateResourcePayload('protocols',{code:'CLIN-01',name:'Protocol',version:'approved',content:'Draft'}).ok,false);
assert.match(routerSource,/stock-movements/, 'stock movements must have dedicated endpoints');
assert.match(routerSource,/INSUFFICIENT_STOCK/, 'stock movement must reject negative balances');
assert.match(migration,/clinical_stock_movements_immutable/, 'inventory ledger must be append-only');
assert.match(migration,/incident','protocol/, 'clinical record schema must include incident and protocol records');

assert.match(routerSource,/EXPIRED_LOT_RECEIPT/, 'expired lots must not accept new stock receipts');
assert.match(migration,/idx_protocol_version_unique/, 'protocol versions must be unique per unit');
assert.match(migration,/ABS\(delta\)=quantity/, 'stock adjustment delta must match the recorded quantity');

const sessionSource=fs.readFileSync(path.join(__dirname,'../backend/src/sessions.js'),'utf8');
assert.match(sessionSource,/unit: row\.unit/, 'rehydrated sessions must expose the unit scope consumed by clinical APIs');

assert.equal(validatePurchaseRequestPayload({itemName:'Luvas nitrílicas',quantity:10,priority:'urgent',justification:'Reposição necessária para o setor'}).ok,true);
assert.equal(validatePurchaseRequestPayload({itemName:'X',quantity:0,priority:'urgent',justification:'abc'}).ok,false);
assert.equal(validatePurchaseRequestPayload({itemName:'Material',quantity:1,priority:'critical',justification:'Motivo suficiente'}).ok,true);
assert.equal(validateProfessionalShiftPayload({professionalId:3,sector:'Enfermaria',startsAt:'2026-11-24T07:00:00-03:00',endsAt:'2026-11-24T19:00:00-03:00'}).ok,true);
assert.equal(validateProfessionalShiftPayload({professionalId:3,sector:'Enfermaria',startsAt:'2026-11-24T19:00:00Z',endsAt:'2026-11-24T07:00:00Z'}).ok,false);
assert.equal(validateProfessionalShiftPayload({professionalId:3,sector:'Enfermaria',startsAt:'2026-11-24T07:00:00Z',endsAt:'2026-11-25T08:00:00Z'}).ok,false);
assert.match(routerSource,/PURCHASE_SELF_APPROVAL/, 'purchase request creator cannot approve their own request');
assert.match(routerSource,/PROFESSIONAL_SHIFT_OVERLAP/, 'overlapping shifts must be rejected');
assert.match(routerSource,/purchasing\.approve/, 'purchase decisions require a separate approval permission');
assert.match(purchasingMigration,/CREATE TABLE IF NOT EXISTS purchase_requests/, 'purchase requests must be persisted in PostgreSQL');
assert.match(purchasingMigration,/CREATE TABLE IF NOT EXISTS professional_shifts/, 'professional shifts must be persisted in PostgreSQL');
assert.match(purchasingMigration,/professionals\.schedule\.write/, 'schedule writes must be granted explicitly');

assert.match(routerSource,/router\.get\('\/api\/v1\/professional-registry'/, 'shift UI must be able to list active professional links');

assert.ok(ROLE_PERMISSIONS.farmacia.includes('purchasing.write'), 'pharmacy may request purchases');
assert.ok(!ROLE_PERMISSIONS.farmacia.includes('purchasing.approve'), 'pharmacy cannot approve purchases');
assert.ok(ROLE_PERMISSIONS.direcao.includes('purchasing.approve'), 'direction may approve purchases');
assert.ok(ROLE_PERMISSIONS.direcao.includes('professionals.schedule.write'), 'direction may manage staff schedules');

const billingDenialsMigration = require('node:fs').readFileSync(require('node:path').join(__dirname,'../database/migrations/20261123_billing_denials_reports.sql'),'utf8');
const migrationRunner = require('node:fs').readFileSync(require('node:path').join(__dirname,'../scripts/apply-clinical-platform-migration.js'),'utf8');
assert.ok(routerSource.includes("router.get('/api/v1/billing-denials'"),'billing denial list must use a dedicated v1 endpoint');
assert.ok(routerSource.includes("router.post('/api/v1/billing-denials'"),'billing denial creation must use a dedicated v1 endpoint');
assert.match(routerSource,/INVALID_BILLING_DENIAL_TRANSITION/,'billing denial status transitions must be validated');
assert.ok(routerSource.includes("router.get('/api/v1/reports/production'"),'production reporting must use a dedicated v1 endpoint');
assert.match(billingDenialsMigration,/CREATE TABLE IF NOT EXISTS billing_denials/,'billing denials must be persisted in PostgreSQL');
assert.ok(migrationRunner.includes('20261123_billing_denials_reports.sql'),'billing denial migration must run in CI and deployment migration flow');
assert.ok(migrationRunner.includes("public.billing_denials'"),'migration runner must verify the billing denial table');
