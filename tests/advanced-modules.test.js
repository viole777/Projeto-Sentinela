'use strict';
const assert = require('node:assert/strict');
const { MODULES, validateModulePayload } = require('../backend/src/routes/advancedModules');

assert.ok(Object.keys(MODULES).length >= 10, 'dedicated operational APIs must be registered');
let result = validateModulePayload('/incidentes', {
  data: '2026-11-19T09:30',
  categoria: 'Operacional',
  setor: 'Recepção',
  gravidade: 'Leve',
  descricao: 'Registro sintético para teste',
  campoInventado: 'não deve ser persistido'
});
assert.equal(result.ok, true);
assert.equal(result.data.campoInventado, undefined, 'unknown input fields must be discarded');
assert.equal(validateModulePayload('/incidentes', { categoria: 'Queda' }).ok, false, 'required fields must be enforced');
assert.equal(validateModulePayload('/agenda/disponibilidade', {
  profissional: 'Profissional sintético', especialidade: 'Teste', unidade: 'Unidade sintética',
  data: '2026-11-19', inicio: '18:00', fim: '08:00'
}).ok, false, 'availability end must be after start');
assert.equal(validateModulePayload('/escalas/trocas', {
  solicitante: 'A', substituto: 'A', data: '2026-11-19', turno: 'Manhã'
}).ok, false, 'a professional cannot replace themselves');
assert.equal(validateModulePayload('/faturamento/glosas', {
  competencia: '2026-13', documento: 'BPA', motivo: 'Motivo sintético'
}).ok, false, 'billing competence must be valid');
assert.equal(validateModulePayload('/configuracoes/modulos', {
  modulo: 'triagem', unidade: 'U1', ativo: 'Ativo'
}).ok, true);
assert.equal(validateModulePayload('/endpoint-inexistente', {}).ok, false);
console.log('advanced operational module API contract tests passed');
