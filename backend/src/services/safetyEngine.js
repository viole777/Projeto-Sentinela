'use strict';

// Motor determinístico de segurança clínica do Sentinela.
// Não diagnostica nem prescreve: aponta inconsistências para revisão profissional.
const { readDB } = require("../db");

const DEFAULT_RULES = Object.freeze({
    alergia: true,
    altoRisco: true,
    duplicidade: true,
    dadosIncompletos: true,
    sinalCritico: true
});

function safetyCheck({ paciente, triagem, prescricao }) {
    const alertas = [];
    const norm = (value) => String(value ?? "").trim().toLowerCase();
    let db = {};
    try { db = readDB() || {}; } catch (_) {}
    const rules = { ...DEFAULT_RULES, ...(db.safetyRules || {}) };
    const alergiaOriginal = triagem?.alergia || paciente?.alergias || "";
    const alergiaTxt = norm(alergiaOriginal);
    const medTxt = norm(prescricao?.medicacao);

    // 1. Alergia x medicação registrada.
    if (rules.alergia && alergiaTxt && !["nenhuma", "-"].includes(alergiaTxt) && medTxt) {
        const termos = alergiaTxt.split(/[,;/]+/).map(term => term.trim()).filter(Boolean);
        if (termos.some(term => term.length >= 3 && medTxt.includes(term))) {
            alertas.push({
                nivel: "CRITICO",
                regra: "alergia",
                mensagem: "Possível conflito com alergia registrada. Revisão profissional obrigatória antes de dispensar.",
                contexto: { alergia: alergiaOriginal, medicacao: prescricao?.medicacao }
            });
        }
    }

    // 2. Medicamentos que exigem uma checagem reforçada.
    const altoRisco = [
        "varfarina", "rivaroxabana", "apixabana", "dabigatrana", "edoxabana",
        "heparina", "enoxaparina", "clopidogrel", "ticagrelor",
        "amiodarona", "digoxina", "insulina"
    ];
    if (rules.altoRisco && altoRisco.some(medicamento => medTxt.includes(medicamento))) {
        alertas.push({
            nivel: "ALTO",
            regra: "alto_risco",
            mensagem: "Medicamento marcado como de alto risco. Confirmar dose, indicação e monitoramento com o profissional responsável.",
            contexto: { medicacao: prescricao?.medicacao }
        });
    }

    // 3. Possível duplicidade com registro anterior; continuidade também precisa de revisão.
    if (rules.duplicidade && medTxt) {
        const duplicada = (db.consultas || []).find(consulta =>
            String(consulta.pacienteCpf) === String(paciente?.cpf) &&
            norm(consulta.medicacao) === medTxt
        );
        if (duplicada) {
            alertas.push({
                nivel: "ATENCAO",
                regra: "duplicidade",
                mensagem: "Medicação igual já registrada para este paciente. Verificar continuidade ou duplicidade.",
                contexto: { consultaAnterior: duplicada.id }
            });
        }
    }

    // 4. Campos essenciais ausentes.
    if (rules.dadosIncompletos && (!medTxt || !norm(prescricao?.diagnostico))) {
        alertas.push({
            nivel: "ATENCAO",
            regra: "dados_incompletos",
            mensagem: "Diagnóstico ou medicação não informado. Revise os campos antes de concluir.",
            contexto: { diagnosticoInformado: Boolean(norm(prescricao?.diagnostico)), medicacaoInformada: Boolean(medTxt) }
        });
    }

    // 5. Sinal fora da faixa configurada no protótipo; não é diagnóstico.
    if (rules.sinalCritico) {
        const tempRaw = triagem?.temperatura ?? triagem?.temp;
        const temp = Number(tempRaw);
        if (tempRaw !== "" && tempRaw != null && Number.isFinite(temp) && (temp >= 39 || temp < 35)) {
            alertas.push({
                nivel: "ALTO",
                regra: "sinal_critico",
                mensagem: "Temperatura registrada fora da faixa configurada no protótipo; solicitar avaliação profissional imediata.",
                contexto: { temperatura: tempRaw }
            });
        }
        const spo2Raw = triagem?.spo2 ?? triagem?.saturacao;
        const spo2 = Number(spo2Raw);
        if (spo2Raw !== "" && spo2Raw != null && Number.isFinite(spo2) && spo2 < 90) {
            alertas.push({
                nivel: "CRITICO",
                regra: "sinal_critico",
                mensagem: "Saturação registrada abaixo do limite de alerta do protótipo; solicitar avaliação profissional imediata.",
                contexto: { spo2: spo2Raw }
            });
        }
    }

    return alertas;
}

module.exports = { safetyCheck, DEFAULT_RULES };
