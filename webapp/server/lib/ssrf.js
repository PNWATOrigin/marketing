import dns from 'node:dns';
import net from 'node:net';

// 로컬 개발/테스트 전용 우회 스위치 (ALLOW_PRIVATE_HOSTS=1). 운영 환경에서는 절대 켜면 안 된다.
const ALLOW_PRIVATE_HOSTS = process.env.ALLOW_PRIVATE_HOSTS === '1';

// 내부망·루프백·링크로컬 등 외부에서 접근하면 안 되는 주소 대역을 차단한다.
// (SSRF 방지: 서버가 사용자 대신 내부 자원에 접근하는 것을 막는다)

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local (클라우드 메타데이터 포함)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 192 && b === 0 && parts[2] === 2) return true; // documentation
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast/reserved
  return false;
}

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::1') return true; // loopback
  if (lower === '::') return true;
  if (lower.startsWith('fe80:') || lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local (fc00::/7)
  if (lower.startsWith('::ffff:')) {
    // IPv4-mapped address
    const v4 = lower.split(':').pop();
    if (v4 && v4.includes('.')) return isPrivateIPv4(v4);
  }
  return false;
}

export function isPrivateIp(ip) {
  if (ALLOW_PRIVATE_HOSTS) return false;
  const version = net.isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true; // 판별 불가능하면 안전하게 차단
}

const BLOCKED_HOSTNAMES = new Set(['localhost', 'localhost.localdomain', 'ip6-localhost', 'metadata.google.internal']);

export class UnsafeUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

export function assertSafeUrlFormat(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError('올바른 URL 형식이 아니에요.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('http 또는 https URL만 사용할 수 있어요.');
  }
  const hostname = url.hostname.toLowerCase();
  if (!ALLOW_PRIVATE_HOSTS && (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal'))) {
    throw new UnsafeUrlError('내부 주소는 분석할 수 없어요.');
  }
  if (net.isIP(hostname) && isPrivateIp(hostname)) {
    throw new UnsafeUrlError('내부/사설 IP 주소는 분석할 수 없어요.');
  }
  return url;
}

// 호스트명을 실제로 DNS 조회해서 사설 IP로 연결되지 않는지 확인한다 (DNS 리바인딩 방지 포함).
export async function resolveSafeAddress(hostname) {
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new UnsafeUrlError('내부/사설 IP 주소는 분석할 수 없어요.');
    return hostname;
  }
  let records;
  try {
    records = await dns.promises.lookup(hostname, { all: true, verbatim: false });
  } catch {
    throw new UnsafeUrlError('호스트 주소를 찾을 수 없어요.');
  }
  if (!records.length) throw new UnsafeUrlError('호스트 주소를 찾을 수 없어요.');
  for (const rec of records) {
    if (isPrivateIp(rec.address)) {
      throw new UnsafeUrlError('내부/사설 IP로 연결되는 주소는 분석할 수 없어요.');
    }
  }
  return records[0].address;
}
