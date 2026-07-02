const crypto = require("crypto");
const pool = require("../config/db");
const { logAction } = require("../utils/audit");

const addRecipient = async (req, res, next) => {
  try {
    const { name, email, phone } = req.body;
    if (!name || (!email && !phone)) {
      return res.status(400).json({ message: "name and at least one of email/phone are required" });
    }
    const verification_token = crypto.randomBytes(24).toString("hex");
    const result = await pool.query(
      `INSERT INTO recipients (switch_id, name, email, phone, verification_token)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, switch_id, name, email, phone, verified, created_at`,
      [req.params.switchId, name, email || null, phone || null, verification_token]
    );
    await logAction(req.user.id, "RECIPIENT_ADDED", req, { recipientId: result.rows[0].id });
    // In production: send verification_token via email/SMS through the notification queue.
    res.status(201).json({ recipient: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

const listRecipients = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, switch_id, name, email, phone, verified, created_at
       FROM recipients WHERE switch_id = $1 ORDER BY created_at ASC`,
      [req.params.switchId]
    );
    res.json({ recipients: result.rows });
  } catch (err) {
    next(err);
  }
};

const verifyRecipient = async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE recipients SET verified = TRUE
       WHERE switch_id = $1 AND verification_token = $2
       RETURNING id, name, verified`,
      [req.params.switchId, req.body.token]
    );
    if (!result.rows[0]) return res.status(400).json({ message: "Invalid verification token" });
    res.json({ recipient: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

const deleteRecipient = async (req, res, next) => {
  try {
    await pool.query("DELETE FROM recipients WHERE id = $1 AND switch_id = $2", [
      req.params.recipientId,
      req.params.switchId,
    ]);
    await logAction(req.user.id, "RECIPIENT_REMOVED", req, { recipientId: req.params.recipientId });
    res.json({ message: "Recipient removed" });
  } catch (err) {
    next(err);
  }
};

module.exports = { addRecipient, listRecipients, verifyRecipient, deleteRecipient };
