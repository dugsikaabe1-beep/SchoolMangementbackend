import crypto from 'crypto';

const getKey = () => {
  const raw = process.env.CONFIG_ENCRYPTION_KEY || process.env.SECRET_KEY || process.env.APP_SECRET || '';
  if (!raw) throw new Error('CONFIG_ENCRYPTION_KEY or SECRET_KEY must be set for encrypt/decrypt');
  // Normalize to 32-byte key
  return crypto.createHash('sha256').update(raw).digest();
};

export const encryptConfig = (obj) => {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${data.toString('base64')}`;
};

export const decryptConfig = (blob) => {
  if (!blob) return null;
  const key = getKey();
  const parts = String(blob).split(':');
  if (parts.length !== 3) return null;
  const iv = Buffer.from(parts[0], 'base64');
  const tag = Buffer.from(parts[1], 'base64');
  const data = Buffer.from(parts[2], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
};

export default { encryptConfig, decryptConfig };
