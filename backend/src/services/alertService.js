'use strict';

function createAlertService({ readDB, writeDB }) {
    function ensureTVShape(db) {
        if (!db.tvChamada) db.tvChamada = null;
        if (!db.tvHistorico) db.tvHistorico = [];
        if (!db.alertas) db.alertas = [];
        return db;
    }

    function registrarAlerta(req, { paciente, nivel, regra, mensagem, contexto }) {
        const db = readDB();
        ensureTVShape(db);
        if (!Array.isArray(db.alertas)) db.alertas = [];

        const alerta = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            quando: new Date().toISOString(),
            nivel: nivel || "ATENCAO",
            regra: regra || "geral",
            mensagem,
            pacienteCpf: paciente?.cpf || paciente?.pacienteCpf || null,
            pacienteNome: paciente?.nome || paciente?.pacienteNome || null,
            contexto: contexto || {},
            geradoPor: req.user ? req.user.usuario : "sistema",
            visualizadoPor: [],
            resolvido: false,
            resolvidoPor: null,
            resolvidoEm: null
        };

        db.alertas.unshift(alerta);
        if (db.alertas.length > 500) db.alertas = db.alertas.slice(0, 500);
        writeDB(db);
        return alerta;
    }

    return { ensureTVShape, registrarAlerta };
}

module.exports = { createAlertService };
