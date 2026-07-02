const crypto = require("crypto");
const pool = require("../config/db");
const { decryptVaultPayload, reconstructKey } = require("../utils/crypto");

// No requireAuth on this router — access is gated entirely by the
// unguessable scoped_token issued when a release fires (see workers/triggerEvaluator.js).

async function loadSession(token) {
  const result = await pool.query(
    `SELECT bps.*, r.name AS recipient_name, r.switch_id
     FROM beneficiary_portal_sessions bps
     JOIN recipients r ON r.id = bps.recipient_id
     WHERE bps.scoped_token = $1`,
    [token]
  );
  return result.rows[0] || null;
}

const getPortal = async (req, res, next) => {
  try {
    const session = await loadSession(req.params.token);
    if (!session) return res.status(404).json({ message: "Invalid or expired link" });
    if (new Date(session.expires_at) < new Date()) {
      return res.status(410).json({ message: "This portal link has expired" });
    }

    await pool.query(
      `UPDATE beneficiary_portal_sessions SET last_accessed = now() WHERE id = $1`,
      [session.id]
    );

    const vaults = await pool.query(
      `SELECT v.id, v.filename, v.content_type, v.vault_type, v.typed_metadata, v.created_at
       FROM release_channels rc
       JOIN vaults v ON v.id = rc.vault_id
       WHERE rc.recipient_id = $1`,
      [session.recipient_id]
    );

    res.json({
      recipientName: session.recipient_name,
      acknowledged: session.acknowledged,
      vaults: vaults.rows,
    });
  } catch (err) {
    next(err);
  }
};

const acknowledge = async (req, res, next) => {
  try {
    const session = await loadSession(req.params.token);
    if (!session) return res.status(404).json({ message: "Invalid or expired link" });

    const receiptPayload = JSON.stringify({ sessionId: session.id, ts: new Date().toISOString() });
    const delivery_receipt_hash = crypto.createHash("sha256").update(receiptPayload).digest("hex");

    await pool.query(
      `UPDATE beneficiary_portal_sessions
       SET acknowledged = TRUE, delivery_receipt_hash = $1
       WHERE id = $2`,
      [delivery_receipt_hash, session.id]
    );
    res.json({ acknowledged: true, delivery_receipt_hash });
  } catch (err) {
    next(err);
  }
};

// Reconstructs the vault key from its Shamir shards and decrypts on demand.
// NOTE: in this reference implementation all shards live on the primary DB,
// which is fine for a portfolio demo but defeats the point of sharding in
// production — shards should live on independent nodes/providers so no
// single compromised database can decrypt a vault alone.
const downloadVault = async (req, res, next) => {
  try {
    const session = await loadSession(req.params.token);
    if (!session) return res.status(404).json({ message: "Invalid or expired link" });
    if (new Date(session.expires_at) < new Date()) {
      return res.status(410).json({ message: "This portal link has expired" });
    }

    const vaultResult = await pool.query(
      `SELECT v.* FROM release_channels rc
       JOIN vaults v ON v.id = rc.vault_id
       WHERE rc.recipient_id = $1 AND v.id = $2`,
      [session.recipient_id, req.params.vaultId]
    );
    const vault = vaultResult.rows[0];
    if (!vault) return res.status(404).json({ message: "Vault not found for this recipient" });

    const fragResult = await pool.query(
      `SELECT key_fragment FROM vault_keys WHERE vault_id = $1 ORDER BY fragment_index ASC LIMIT 2`,
      [vault.id]
    );
    if (fragResult.rows.length < 2) {
      return res.status(500).json({ message: "Insufficient key shards to reconstruct vault key" });
    }

    const rawKey = reconstructKey(fragResult.rows.map((r) => r.key_fragment));
    const plaintext = decryptVaultPayload(vault.encrypted_data, rawKey);

    const log = Array.isArray(session.download_log) ? session.download_log : [];
    log.push({ vaultId: vault.id, at: new Date().toISOString() });
    await pool.query(
      `UPDATE beneficiary_portal_sessions SET download_log = $1 WHERE id = $2`,
      [JSON.stringify(log), session.id]
    );

    res.json({
      filename: vault.filename,
      content_type: vault.content_type,
      vault_type: vault.vault_type,
      content: plaintext,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getPortal, acknowledge, downloadVault };
