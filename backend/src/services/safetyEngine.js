'use strict';

// Motor determinístico de segurança clínica do Sentinela.
// Não diagnostica nem prescreve: apenas aponta inconsistências para revisão profissional.
const { readDB } = require("../db");

function safetyCheck({ paciente, triagem, prescricao }) {
    const alertas = [];
    const norm = (s) => String(s || "").trim().toLowerCase();
    const defaultRules = { alergia:true, altoRisco:true, duplicidade:true, dadosIncompletos:true, sinalCritico:true };
    let db = {};
    try { db = readDB() || {}; } catch (_) {}
    const rules = { ...defaultRules, ...(db.safetyRules || {}) };

    // 1. Alergia x medicação prescrita
    const alergiaTxt = norm(triagem?.alergia || paciente?.alergias);
    const medTxt = norm(prescricao?.medicacao);
    if (rules.alergia && alergiaTxt && alergiaTxt !== "nenhuma" && alergiaTxt !== "-" && medTxt) {
        const termos = alergiaTxt.split(/[,;/]+/).map(t => t.trim()).filter(Boolean);
        if (termos.some(t => t.length >= 3 && medTxt.includes(t))) {
            alertas.push({
                nivel: "CRITICO",
                regra: "alergia",
                mensagem: "Possível conflito com alergia registrada. Revisão obrigatória antes de dispensar.",
                contexto: { alergia: triagem?.alergia, medicacao: prescricao?.medicacao }
            });
        }
    }

    // 2. Medicamento de alto risco (ex.: anticoagulantes — cardiologia)
    const altoRisco = ["varfarina", "rivaroxabana", "apixabana", "dabigatrana", "edoxabana", "heparina", "enoxaparina", "clopidogrel", "ticagrelor", "amiodarona", "digoxina", "insulina"];
    if (rules.altoRisco && altoRisco.some(m => medTxt.includes(m))) {
        alertas.push({
            nivel: "ALTO",
            regra: "alto_risco",
            mensagem: "Medicamento de alto risco (protocolo cardiológico). Confirmar dose, indicação registrada e monitoramento.",
            contexto: { medicacao: prescricao?.medicacao }
        });
    }

    // 3. Duplicidade (mesmo texto de medicação já prescrito e ativo)
    try {
        const dup = rules.duplicidade ? (db.consultas || []).find(c =>
            String(c.pacienteCpf) === String(paciente?.cpf) &&
            norm(c.medicacao) && norm(c.medicacao) === medTxt
        ) : null;
        if (dup && medTxt) {
            alertas.push({
                nivel: "ATENCAO",
                regra: "duplicidade",
                mensagem: "Medicação já registrada para este paciente. Verificar se é continuidade ou duplicidade.",
                contexto: { consultaAnterior: dup.id }
            });
        }
    } catch (_) {}

    // 4. Dados incompletos
    if (rules.dadosIncompletos && (!medTxt || !norm(prescricao?.diagnostico))) {
        alertas.push({
            nivel: "ATENCAO",
            regra: "dados_incompletos",
            mensagem: "Prescrição com informação obrigatória ausente (diagnóstico/medicação).",
            contexto: {}
        });
    }

    // 5. Sinais que exigem avaliação imediata (NÃO é diagnóstico)
    const temp = Number(triagem?.temperatura);
    if (rules.sinalCritico && !Number.isNaN(temp) && triagem?.temperatura !== "" && triagem?.temperatura != null && (temp >= 39 || temp < 35)) {
        alertas.push({
            nivel: "ALTO",
            regra: "sinal_critico",
            mensagem: "Sinal registrado exige avaliação clínica imediata (temperatura fora da faixa).",
            contexto: { temperatura: triagem?.temperatura }
        });
    }

    return alertas;
}

module.exports = { safetyCheck };
