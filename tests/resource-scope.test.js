'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  assertCareTeamAccess,
  minimizePatientFields
} = require('../backend/src/services/resourceScope');

(async () => {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      return { rowCount: sql.includes('patient_resource_access') ? 0 : 1, rows: [{}] };
    }
  };
  assert.equal(await assertCareTeamAccess(client, {
    username: 'medico',
    role: 'medico',
    unitId: 'UNI-1',
    sectorId: 'UTI',
    patientCpf: '00000000000',
    permission: 'records.read'
  }), true);
  assert.equal(calls.length, 2);

  const patient = {
    id: 1,
    name: 'Paciente sintético',
    cpf: '12345678901',
    status: 'triagem',
    created_at: '2026-01-01'
  };
  const medicoView = minimizePatientFields('medico', patient);
  assert.equal(medicoView.cpf, '123***.***-01');
  const directionView = minimizePatientFields('direcao', patient);
  assert.equal(directionView.cpf, '123***.***-01');

  const source = fs.readFileSync(
    path.join(__dirname, '../backend/src/routes/clinicalPlatform.js'),
    'utf8'
  );
  assert.doesNotMatch(source, /router\.(?:get|post)\(['"]\/api\/v1\/:resource/);
  assert.match(source, /Object\.entries\(RESOURCE_DEFS\)/);
  console.log('resource scope and field minimization tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
