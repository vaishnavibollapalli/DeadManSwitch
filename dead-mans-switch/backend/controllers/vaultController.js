const pool = require("../config/db");
const { logAction } = require("../utils/audit");
const { encryptVaultPayload, shardKey } = require("../utils/crypto");

const VAULT_TYPES = ["GENERAL", "VIDEO", "LEGAL", "CRYPTO", "SOCIAL", "AI_HANDOFF", "PASSWORDS"];

// Creates a vault. Content is encrypted server-side with a one-time AES-256
// key; that key is immediately split via Shamir's Secret Sharing into 3
// fragments (2-of-3 threshold) and the raw key is discarded — never stored.
const createVault = async (req, res, next) => {
  try {
    const { content, filename, content_type, vault_type = "GENERAL", typed_metadata = {} } = req.body;

    if (!content) return res.status(400).json({ message: "content is required" });
    if (!VAULT_TYPES.includes(vault_type)) {
      return res.status(400).json({ message: `vault_type must be one of ${VAULT_TYPES.join(", ")}` });
    }

    const { encrypted_data, rawKey } = encryptVaultPayload(content);

    const vaultResult = await pool.query(
      `INSERT INTO vaults (switch_id, encrypted_data, filename, content_type, vault_type, typed_metadata)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, switch_id, filename, content_type, vault_type, typed_metadata, created_at`,
      [req.params.switchId, encrypted_data, filename || null, content_type || null, vault_type, typed_metadata]
    );
    const vault = vaultResult.rows[0];

    const fragments = shardKey(rawKey, 3, 2);
    for (const frag of fragments) {
      await pool.query(
        `INSERT INTO vault_keys (vault_id, key_fragment, fragment_index, holder_type)
         VALUES ($1, $2, $3, $4)`,
        [vault.id, frag.key_fragment, frag.fragment_index, "SERVER"]
      );
    }

    await logAction(req.user.id, "VAULT_CREATED", req, { vaultId: vault.id, vault_type });

    res.status(201).json({ vault, keyShards: fragments.length, threshold: 2 });
  } catch (err) {
    next(err);
  }
};

// Never returns encrypted_data or key fragments in a list — metadata only.
const listVaults = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, switch_id, filename, content_type, vault_type, typed_metadata, created_at
       FROM vaults WHERE switch_id = $1 ORDER BY created_at DESC`,
      [req.params.switchId]
    );
    res.json({ vaults: result.rows });
  } catch (err) {
    next(err);
  }
};

const deleteVault = async (req, res, next) => {
  try {
    await pool.query("DELETE FROM vaults WHERE id = $1 AND switch_id = $2", [
      req.params.vaultId,
      req.params.switchId,
    ]);
    await logAction(req.user.id, "VAULT_DELETED", req, { vaultId: req.params.vaultId });
    res.json({ message: "Vault deleted" });
  } catch (err) {
    next(err);
  }
};

module.exports = { createVault, listVaults, deleteVault, VAULT_TYPES };
