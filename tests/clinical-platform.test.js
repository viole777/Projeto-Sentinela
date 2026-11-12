'use strict';
const assert = require('node:assert/strict');
const { RESOURCE_DEFS, validateResourcePayload, normalizeCpf } = require('../backend/src/routes/clinicalPlatform');
const { ROLE_PERMISSIONS } = require('../backend/src/db');

assert.ok(Object.keys(RESOURCE_DEFS).length >= 15, 'all clinical domains must have explicit resource definitions');
assert.equal(normalizeCpf('123.456.789-00'),'12345678900');

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
 patientCpf:'12345678900',medicationName:'Medicamento',dose:'1 unidade',route:'oral',frequency:'conforme prescrição',quantity:30
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
assert.ok(ROLE_PERMISSIONS.direcao.includes('billing.write'));
assert.ok(ROLE_PERMISSIONS.enfermagem.includes('beds.manage'));

const fs=require('node:fs');
const path=require('node:path');
const routerSource=fs.readFileSync(path.join(__dirname,'../backend/src/routes/clinicalPlatform.js'),'utf8');
const migration=fs.readFileSync(path.join(__dirname,'../database/migrations/20261112_clinical_platform.sql'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'../backend/server.js'),'utf8');
assert.match(routerSource,/WHERE resource_type=\$1 AND unit_id=\$2/, 'clinical record lists must be unit-scoped');
assert.match(routerSource,/patient-summary\/:cpf/, 'patient summary must have a dedicated route');
assert.match(routerSource,/ORDER BY expires_on ASC,id ASC FOR UPDATE/, 'dispensing must lock FEFO lots');
assert.match(routerSource,/PRESCRIPTION_NOT_VALIDATED/, 'dispensing must require the latest professional validation');
assert.match(routerSource,/ORDER BY id DESC LIMIT 1/, 'validation decision must be resolved from the latest event');
assert.match(routerSource,/SIGNATURE_ADAPTER_NOT_IMPLEMENTED/, 'the API must not pretend a digital signature is implemented');
assert.match(routerSource,/OFFICIAL_CATALOG_NOT_LOADED/, 'missing official catalogs must fail explicitly');
assert.match(migration,/clinical_records_immutable/, 'clinical records must be append-only');
assert.match(migration,/clinical_audit_no_update/, 'clinical audit must be append-only');
assert.match(migration,/WHERE role_id IN/, 'migration must reconcile built-in role grants');
assert.match(server,/clinicalPlatform\"\)\.createClinicalPlatformRouter/, 'versioned clinical router must be mounted');
assert.ok(!ROLE_PERMISSIONS.medico.includes('triage.read'));
assert.ok(ROLE_PERMISSIONS.farmacia.includes('prescriptions.dispense'));
assert.ok(ROLE_PERMISSIONS.recepcao.includes('patients.identity.write'));
assert.ok(ROLE_PERMISSIONS.admin.includes('integration.manage'));

console.log('clinical platform schema validation tests passed');
