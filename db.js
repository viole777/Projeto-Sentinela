const postgres = require('postgres');
const connectionString = process.env.DATABASE_URL;
const sql = postgres(connectionString, { ssl: process.env.PGSSSL === 'disable' ? false : 'require' });
module.exports = sql;
