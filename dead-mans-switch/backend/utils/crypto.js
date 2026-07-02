const crypto = require("crypto");
const sss = require("shamirs-secret-sharing");

const ALGO = "aes-256-gcm";

/**
 * Encrypts a plaintext buffer/string with a fresh random AES-256 key.
 * Returns the ciphertext (base64, iv+tag+data packed) and the raw key,
 * so the caller can immediately shard the key with Shamir's Secret Sharing
 * and discard it — the server never persists the raw key.
 */
function encryptVaultPayload(plaintext) {
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const data = Buffer.concat([
    cipher.update(Buffer.from(plaintext, "utf8")),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const packed = Buffer.concat([iv, tag, data]).toString("base64");
  return { encrypted_data: packed, rawKey: key };
}

function decryptVaultPayload(packedBase64, rawKey) {
  const packed = Buffer.from(packedBase64, "base64");
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const data = packed.subarray(28);

  const decipher = crypto.createDecipheriv(ALGO, rawKey, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return plaintext.toString("utf8");
}

/**
 * Splits the raw AES key into N shares, M of which are required to
 * reconstruct it (Shamir's Secret Sharing). Default: 3 shares, 2 required
 * (e.g. primary server + backup server + user-held recovery share).
 */
function shardKey(rawKey, shares = 3, threshold = 2) {
  const shardsBuffers = sss.split(rawKey, { shares, threshold });
  return shardsBuffers.map((buf, idx) => ({
    fragment_index: idx,
    key_fragment: buf.toString("base64"),
  }));
}

function reconstructKey(fragmentsBase64) {
  const buffers = fragmentsBase64.map((f) => Buffer.from(f, "base64"));
  return sss.combine(buffers);
}

module.exports = {
  encryptVaultPayload,
  decryptVaultPayload,
  shardKey,
  reconstructKey,
};
