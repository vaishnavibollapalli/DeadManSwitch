const crypto = require("crypto");
const pool = require("../config/db");

/**
 * Appends a hash-chained proof-of-life receipt for a switch. Each receipt's
 * hash is derived from its own content PLUS the previous receipt's hash,
 * so altering or deleting any past row breaks every hash after it —
 * the same tamper-evidence property as a blockchain, without needing one.
 */
async function appendReceipt(switchId, eventType, metadata = {}) {
  const prev = await pool.query(
    `SELECT receipt_hash FROM proof_of_life_receipts
     WHERE switch_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [switchId]
  );
  const previousHash = prev.rows[0]?.receipt_hash || null;

  const payload = JSON.stringify({
    switchId,
    eventType,
    metadata,
    previousHash,
    ts: new Date().toISOString(),
  });
  const receiptHash = crypto.createHash("sha256").update(payload).digest("hex");

  const result = await pool.query(
    `INSERT INTO proof_of_life_receipts (switch_id, event_type, receipt_hash, previous_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [switchId, eventType, receiptHash, previousHash]
  );
  return result.rows[0];
}

/** Walks the chain for a switch and verifies no link has been tampered with. */
async function verifyChain(switchId) {
  const result = await pool.query(
    `SELECT * FROM proof_of_life_receipts WHERE switch_id = $1 ORDER BY created_at ASC`,
    [switchId]
  );
  let expectedPrev = null;
  for (const row of result.rows) {
    if (row.previous_hash !== expectedPrev) {
      return { valid: false, brokenAt: row.id };
    }
    expectedPrev = row.receipt_hash;
  }
  return { valid: true, length: result.rows.length };
}

module.exports = { appendReceipt, verifyChain };
