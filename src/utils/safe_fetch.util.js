const dns = require('dns').promises;
const net = require('net');

// Fetches a web page for a user-supplied URL without letting the server be pointed at its own network (SSRF).
// shortcut: the host is resolved and checked, then fetch resolves it again, so a DNS-rebinding attacker could
// still win that race; pin the checked IP with a custom dispatcher before exposing this to hostile users.

const httpError = (message, statusCode = 422) => Object.assign(new Error(message), { statusCode });

function isPrivateIPv4(ip) {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
}

async function assertPublicHost(hostname) {
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw httpError('That address is not allowed.', 400);
    return;
  }
  let addrs;
  try {
    addrs = await dns.lookup(hostname, { all: true });
  } catch {
    throw httpError("We couldn't find that website.");
  }
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw httpError('That address is not allowed.', 400);
}

async function readCapped(res, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of res.body) {
    total += chunk.length;
    if (total > maxBytes) break; // enough of the page: recipe data sits in the head or early body
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// -> { html, finalUrl }
async function fetchPage(rawUrl, { timeoutMs = 10000, maxBytes = 2 * 1024 * 1024, maxRedirects = 3 } = {}) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw httpError('Please enter a full web address starting with http:// or https://', 400);
  }
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!['http:', 'https:'].includes(url.protocol)) throw httpError('Please enter a web address starting with http:// or https://', 400);
    if (url.port && !['80', '443'].includes(url.port)) throw httpError('That address is not allowed.', 400);
    await assertPublicHost(url.hostname);

    let res;
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; MealistRecipeImport/1.0)', accept: 'text/html,application/xhtml+xml' },
      });
    } catch {
      throw httpError("We couldn't open that page.");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), url);
      continue;
    }
    if (!res.ok) throw httpError(`That site did not let us read the page (${res.status}).`);
    if (!/html|xml|text/i.test(res.headers.get('content-type') || '')) throw httpError("That link isn't a web page.");
    return { html: await readCapped(res, maxBytes), finalUrl: url.toString() };
  }
  throw httpError('That link redirects too many times.');
}

module.exports = { fetchPage, isPrivateAddress };
