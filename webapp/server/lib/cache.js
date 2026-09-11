import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';

export const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const pending = new Map();
export async function cached(namespace, key, compute, ttl = 86400000) {
  const file = path.join(config.dataDir, 'cache', namespace, `${digest(key)}.json`);
  try { const entry = JSON.parse(await fs.readFile(file, 'utf8')); if (Date.now() - entry.at < ttl) return entry.value; } catch {}
  if (pending.has(file)) return pending.get(file);
  const task = (async () => {
    const value = await compute();
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temp, JSON.stringify({ at: Date.now(), value }));
    await fs.rename(temp, file);
    return value;
  })();
  pending.set(file, task);
  try { return await task; } finally { pending.delete(file); }
}
