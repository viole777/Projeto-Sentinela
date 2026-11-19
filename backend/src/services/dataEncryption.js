'use strict';

const crypto = require('node:crypto');

class LocalKeyProvider {
  constructor(secret) {
    if (!secret || Buffer.from(secret).length < 32) {
      throw new Error('LocalKeyProvider requer DATA_ENCRYPTION_KEY com pelo menos 32 bytes.');
    }
    this.key = crypto.createHash('sha256').update(String(secret)).digest();
  }

  async getEncryptionKey(keyId = 'local-v1') {
    return { keyId, key: this.key };
  }
}

class KmsKeyProvider {
  constructor() {
    this.configured = false;
  }

  async getEncryptionKey() {
    throw new Error('KMS não configurado. Configure o provedor homologado por variável de ambiente.');
  }
}

function createKeyProvider(env = process.env) {
  const provider = String(env.DATA_KEY_PROVIDER || 'local').toLowerCase();
  if (provider === 'kms') {
    if (!env.KMS_KEY_ID) throw new Error('KMS_KEY_ID é obrigatório para DATA_KEY_PROVIDER=kms.');
    return new KmsKeyProvider();
  }
  if (env.NODE_ENV === 'production' && !env.DATA_ENCRYPTION_KEY) {
    throw new Error('DATA_ENCRYPTION_KEY é obrigatório em produção.');
  }
  return new LocalKeyProvider(env.DATA_ENCRYPTION_KEY || 'sentinela-local-dev-key-change-me');
}

async function encryptField(plainText, keyProvider) {
  if (plainText === null || plainText === undefined || plainText === '') return null;
  const { keyId, key } = await keyProvider.getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${keyId}:${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
}

async function decryptField(encrypted, keyProvider) {
  if (!encrypted) return null;
  const parts = String(encrypted).split(':');
  if (parts.length !== 5 || parts[0] !== 'v1') throw new Error('Formato cifrado inválido.');
  const { key } = await keyProvider.getEncryptionKey(parts[1]);
  const iv = Buffer.from(parts[2], 'base64url');
  const tag = Buffer.from(parts[3], 'base64url');
  const ciphertext = Buffer.from(parts[4], 'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function blindIndex(value, pepper) {
  if (value === null || value === undefined || value === '') return null;
  return crypto.createHmac('sha256', String(pepper)).update(String(value).replace(/\D/g, '')).digest('hex');
}

module.exports = {
  LocalKeyProvider,
  KmsKeyProvider,
  createKeyProvider,
  encryptField,
  decryptField,
  blindIndex
};
