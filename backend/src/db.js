const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'db.json');

function ensureDBShape(db) {
  if (!db.usuarios) db.usuarios = [];
  if (!db.pacientes) db.pacientes = [];
  if (!db.leitos) db.leitos = [];
  if (!db.agendamentos) db.agendamentos = [];
  if (!db.prescricoes) db.prescricoes = [];
  if (!db.internacoes) db.internacoes = [];
  if (!db.triagens) db.triagens = [];
  if (!db.consultas) db.consultas = [];
  if (!db.atendimentos) db.atendimentos = [];
  if (!db.auditoria) db.auditoria = [];
  return db;
}

function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    return ensureDBShape({
      usuarios: [],
      pacientes: [],
      leitos: [],
      agendamentos: [],
      prescricoes: [],
      internacoes: [],
      triagens: [],
      consultas: [],
      atendimentos: [],
      auditoria: [],
    });
  }
  return ensureDBShape(JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

module.exports = { readDB, writeDB };

