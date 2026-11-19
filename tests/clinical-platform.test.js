'use strict';
const assert = require('node:assert/strict');
const { RESOURCE_DEFS, validateResourcePayload, normalizeCpf, classifyIdentityChanges } = require('../backend/src/routes/clinicalPlatform');
const { ROLE_PERMISSIONS } = require('../backend/src/db');

assert.ok(Object.keys(RESOURCE_DEFS).length >= 15, 'all clinical domains must have explicit resource definitions');
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
const baseSchema=fs.readFileSync(path.join(__dirname,'../database.sql'),'utf8');
const operationalMigration=fs.readFileSync(path.join(__dirname,'../database/migrations/20261119_operational_modules.sql'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'../backend/server.js'),'utf8');
assert.match(routerSource,/WHERE resource_type=\$1 AND unit_id=\$2/, 'clinical record lists must be unit-scoped');
assert.match(routerSource,/patient-summary\/:cpf/, 'patient summary must have a dedicated route');
assert.match(routerSource,/api\/v1\/patient-allergies/, 'allergy history must have a dedicated clinical API');
assert.match(routerSource,/api\/v1\/inventory-items/, 'inventory items must have a unit-scoped API');
assert.match(routerSource,/api\/v1\/prescription-validations/, 'pharmacy validation must use a dedicated prescription workflow API');
assert.match(routerSource,/api\/v1\/inventory-movements/, 'stock movements must have a dedicated transactional API');
assert.match(routerSource,/INSUFFICIENT_STOCK/, 'stock movements must prevent negative inventory');
assert.match(routerSource,/SENSITIVE_IDENTIFIER_PERMISSION_REQUIRED/, 'identifier changes must require elevated authorization');
assert.match(routerSource,/CPF_CHANGE_REQUIRES_RELATIONAL_REKEY/, 'CPF changes must remain blocked until references can be rekeyed safely');
assert.match(routerSource,/audit\(req,client,'access_denied','patient_identity'/, 'denied sensitive identity changes must be audited');
assert.match(routerSource,/audit\(req,client,'update','patient_identity'/, 'successful identity changes must be audited as updates');
assert.match(routerSource,/await client\.query\('BEGIN'\);[\s\S]*?INSERT INTO patients[\s\S]*?await audit\(req,client,'create','patient_identity'[\s\S]*?await client\.query\('COMMIT'\)/, 'patient creation and its audit event must share one transaction');
assert.match(routerSource,/await client\.query\('BEGIN'\);[\s\S]*?INSERT INTO medication_lots[\s\S]*?await audit\(req,client,'create','medication_lot'[\s\S]*?await client\.query\('COMMIT'\)/, 'medication lot creation and its audit event must share one transaction');
assert.match(routerSource,/await client\.query\('BEGIN'\);[\s\S]*?INSERT INTO appointments[\s\S]*?await audit\(req,client,'create','appointment'[\s\S]*?await client\.query\('COMMIT'\)/, 'appointment creation and its audit event must share one transaction');
assert.match(routerSource,/ORDER BY expires_on ASC,id ASC FOR UPDATE/, 'dispensing must lock FEFO lots');
assert.match(routerSource,/PRESCRIPTION_NOT_VALIDATED/, 'dispensing must require the latest professional validation');
assert.match(routerSource,/UPDATE beds SET status=\$1,patient_cpf=\$2,patient_name=\$3,occupied_since=NOW\(\).*?\['occupied',data\.patientCpf,patient\.rows\[0\]\.name,data\.bedCode,unitOf\(req\)\]/, 'admission must occupy the selected bed and associate the patient');
assert.match(routerSource,/ORDER BY id DESC LIMIT 1/, 'validation decision must be resolved from the latest event');
assert.match(routerSource,/SIGNATURE_ADAPTER_NOT_IMPLEMENTED/, 'the API must not pretend a digital signature is implemented');
assert.match(routerSource,/OFFICIAL_CATALOG_NOT_LOADED/, 'missing official catalogs must fail explicitly');
assert.match(baseSchema,/CREATE TABLE IF NOT EXISTS patients \([\s\S]*?unit_id TEXT[\s\S]*?\);[\s\S]*?idx_patients_cpf_blind_unit/, 'patient unit scope must exist before the blind-index schema index is created');
assert.match(migration,/clinical_records_immutable/, 'clinical records must be append-only');
assert.match(operationalMigration,/patient_allergies_immutable/, 'allergy history must be append-only');
assert.match(operationalMigration,/inventory_movements_immutable/, 'stock movement ledger must be append-only');
assert.match(operationalMigration,/idx_inventory_unit_name_unique/, 'inventory item uniqueness must be scoped by unit');
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
