"""Public Ohouse HTML fetch with browser-compatible TLS; DNS is pinned by Node."""
import ipaddress
import sys
from urllib.parse import urlsplit
from curl_cffi import requests, CurlOpt

url, address, timeout, limit = sys.argv[1:]
parsed = urlsplit(url)
if parsed.scheme != 'https' or parsed.hostname != 'store.ohou.se' or parsed.port not in (None, 443) or parsed.username or parsed.password:
    raise ValueError('Unsupported product URL')
ip = ipaddress.ip_address(address)
if not ip.is_global:
    raise ValueError('Non-public address')
pinned = f'[{address}]' if ip.version == 6 else address
with requests.Session(curl_options={CurlOpt.RESOLVE: [f'store.ohou.se:443:{pinned}'.encode()]}, trust_env=False) as session:
    response = session.get(url, impersonate='chrome', timeout=float(timeout)/1000, allow_redirects=False, stream=True)
    if response.status_code != 200 or 'text/html' not in response.headers.get('content-type', ''):
        raise ValueError('Product page unavailable')
    chunks, total = [], 0
    for chunk in response.iter_content():
        total += len(chunk)
        if total > int(limit):
            raise ValueError('Page too large')
        chunks.append(chunk)
    sys.stdout.buffer.write(b''.join(chunks))
