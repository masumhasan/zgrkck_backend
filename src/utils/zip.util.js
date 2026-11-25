const zlib = require('zlib');

// Reads named files out of a zip held in memory (stored or deflate; no zip64).
// `names` are matched against the file's base name, e.g. 'food.csv'. Returns { name: Buffer }.
function readZipEntries(buf, names) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Corrupt zip directory');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localAt = buf.readUInt32LE(p + 42);
    const base = buf.toString('utf8', p + 46, p + 46 + nameLen).split('/').pop();
    p += 46 + nameLen + extraLen + commentLen;
    if (!names.includes(base)) continue;
    if (compSize === 0xffffffff) throw new Error('zip64 is not supported');
    const dataAt = localAt + 30 + buf.readUInt16LE(localAt + 26) + buf.readUInt16LE(localAt + 28);
    const data = buf.subarray(dataAt, dataAt + compSize);
    out[base] = method === 0 ? data : zlib.inflateRawSync(data);
  }
  const missing = names.filter((x) => !out[x]);
  if (missing.length) throw new Error(`Zip is missing ${missing.join(', ')}`);
  return out;
}

module.exports = { readZipEntries };
