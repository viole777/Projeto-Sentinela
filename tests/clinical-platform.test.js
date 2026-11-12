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
 patientCpf:'12345678900',medicationName:'Medicamento',dose:'1 unidade',route:'oral',frequency:'conforme prescrição'
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
assert.ok(!ROLE_PERMISSIONS.medico.includes('triage.read'));
assert.ok(ROLE_PERMISSIONS.farmacia.includes('prescriptions.dispense'));
assert.ok(ROLE_PERMISSIONS.recepcao.includes('patients.identity.write'));
assert.ok(ROLE_PERMISSIONS.admin.includes('integration.manage'));

console.log('clinical platform schema validation tests passed');
