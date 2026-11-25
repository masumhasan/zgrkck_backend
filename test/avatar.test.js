const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { imageType, signature } = require('../src/services/avatar.service');

test('image type comes from the bytes, not the header', () => {
  assert.strictEqual(imageType(fs.readFileSync(path.join(__dirname, '..', 'user.jpg'))), 'jpeg');
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]);
  assert.strictEqual(imageType(png), 'png');
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);
  assert.strictEqual(imageType(webp), 'webp');
  assert.strictEqual(imageType(Buffer.from('<?php echo "hi"; ?>')), null);
  assert.strictEqual(imageType(Buffer.alloc(0)), null);
});

test('signature signs the params sorted by key', () => {
  const a = signature({ timestamp: '1', public_id: 'x' }, 'secret');
  const b = signature({ public_id: 'x', timestamp: '1' }, 'secret');
  assert.strictEqual(a, b);
  assert.match(a, /^[0-9a-f]{40}$/);
});
