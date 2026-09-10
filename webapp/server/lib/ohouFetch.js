import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { assertSafeUrlFormat, resolveSafeAddress } from './ssrf.js';
const exec = promisify(execFile);
export async function fetchOhouPage(rawUrl, { timeoutMs, maxBytes }) {
  const url = assertSafeUrlFormat(rawUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'store.ohou.se' || url.port || url.username || url.password || !/^\/goods\/\d+\/?$/.test(url.pathname)) throw new Error('Unsupported product URL');
  const address = await resolveSafeAddress(url.hostname);
  const { stdout } = await exec(process.env.PYTHON_PATH || 'python3', [fileURLToPath(new URL('./ohouFetch.py', import.meta.url)), url.toString(), address, String(timeoutMs), String(maxBytes)], { timeout: timeoutMs + 1000, maxBuffer: maxBytes, encoding: 'utf8', windowsHide: true });
  return { html: stdout, finalUrl: url.toString() };
}
