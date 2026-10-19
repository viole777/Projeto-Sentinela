'use strict';

const assert = require('node:assert/strict');
const { safetyCheck, DEFAULT_RULES } = require('../backend/src/services/safetyEngine');

function run() {
  assert.deepEqual(DEFAULT_RULES, {
    alergia: true,
    altoRisco: true,
    duplicidade: true,
    dadosIncompletos: true,
    sinalCritico: true
  });

  const patient = { cpf: 'SAFETY-TEST-UNIQUE-2026', nome: 'Paciente de teste' };
  const findings = safetyCheck({
    paciente: patient,
    triagem: { alergia: 'penicilina', temperatura: 40, spo2: 85 },
    prescricao: { diagnostico: 'registro de teste', medicacao: 'penicilina e varfarina' }
  });
  const rules = findings.map(item => item.regra);
  assert.ok(rules.includes('alergia'), 'Deve sinalizar possível conflito com alergia');
  assert.ok(rules.includes('alto_risco'), 'Deve sinalizar medicamento de alto risco');
  assert.equal(rules.filter(rule => rule === 'sinal_critico').length, 2, 'Deve verificar temperatura e SpO2 fora dos limites de alerta');

  const incomplete = safetyCheck({
    paciente: { cpf: 'SAFETY-TEST-INCOMPLETE-2026' },
    triagem: {},
    prescricao: { diagnostico: '', medicacao: '' }
  });
  assert.ok(incomplete.some(item => item.regra === 'dados_incompletos'), 'Deve sinalizar campos essenciais ausentes');

  console.log('Safety Engine tests concluídos: alergia, alto risco, sinais críticos e dados incompletos OK.');
}

try {
  run();
} catch (error) {
  console.error('Safety Engine test falhou:', error.message);
  process.exit(1);
}
