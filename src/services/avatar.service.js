const crypto = require('crypto');
const { User } = require('../models/user.model');
const { config } = require('../config/env');

const MAX_BYTES = 5 * 1024 * 1024;
const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

// What the bytes really are (never trust the Content-Type header): jpeg, png or webp, else null.
function imageType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

// Cloudinary signed-upload signature: params sorted by key, joined as k=v&..., then the secret, SHA-1.
function signature(params, secret) {
  const toSign = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
  return crypto.createHash('sha1').update(toSign + secret).digest('hex');
}

class AvatarService {
  // Uploads the user's photo to Cloudinary (one image per user, replaced on each upload,
  // cropped to a 400px square around the face) and stores the URL on the user.
  async setAvatar(userId, buf) {
    const { cloudName, apiKey, apiSecret } = config.cloudinary;
    if (!cloudName || !apiKey || !apiSecret) throw httpError('Photo upload is not configured', 503);
    if (!buf?.length) throw httpError('No image received', 400);
    if (buf.length > MAX_BYTES) throw httpError('Image is larger than 5 MB', 413);
    const type = imageType(buf);
    if (!type) throw httpError('Please choose a JPEG, PNG or WebP image', 415);

    const params = {
      invalidate: 'true',
      overwrite: 'true',
      public_id: `mealist/avatars/${userId}`,
      timestamp: String(Math.floor(Date.now() / 1000)),
      transformation: 'c_fill,g_face,w_400,h_400',
    };
    const form = new FormData();
    Object.entries(params).forEach(([k, v]) => form.append(k, v));
    form.append('api_key', apiKey);
    form.append('signature', signature(params, apiSecret));
    form.append('file', new Blob([buf], { type: `image/${type}` }), `avatar.${type}`);

    let res;
    try {
      res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(30000),
      });
    } catch (err) {
      console.error('Cloudinary upload failed:', err.message);
      throw httpError('Could not upload your photo, please try again', 502);
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.secure_url) {
      console.error('Cloudinary upload rejected:', res.status, body?.error?.message);
      throw httpError('Could not upload your photo, please try again', 502);
    }

    await User.updateOne({ _id: userId }, { $set: { avatarUrl: body.secure_url } }).exec();
    return { avatarUrl: body.secure_url };
  }
}

module.exports = new AvatarService();
module.exports.imageType = imageType;
module.exports.signature = signature;
