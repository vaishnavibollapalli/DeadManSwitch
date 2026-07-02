const pool = require("../config/db");
const { appendReceipt } = require("../utils/hashChain");

// Public endpoint — the person acting here is a witness/recipient, not the
// account owner, so it's gated by the recipient's own verification_token
// rather than a JWT. This is the same trust model as an email "click to
// confirm" link.
const submitConfirmation = async (req, res, next) => {
  try {
    const { conditionId } = req.params;
    const { recipientId, token, response } = req.body;

    const validResponses = ["CONFIRMED_ALIVE", "CANNOT_CONFIRM", "CONFIRMED_DECEASED"];
    if (!validResponses.includes(response)) {
      return res.status(400).json({ message: `response must be one of ${validResponses.join(", ")}` });
    }

    const condition = await pool.query(
      "SELECT * FROM trigger_conditions WHERE id = $1 AND condition_type = 'WITNESS_QUORUM'",
      [conditionId]
    );
    if (!condition.rows[0]) return res.status(404).json({ message: "Witness condition not found" });

    const recipient = await pool.query(
      "SELECT * FROM recipients WHERE id = $1 AND switch_id = $2 AND verification_token = $3",
      [recipientId, condition.rows[0].switch_id, token]
    );
    if (!recipient.rows[0]) return res.status(403).json({ message: "Invalid witness credentials" });

    await pool.query(
      `INSERT INTO witness_confirmations (switch_id, recipient_id, condition_id, response)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (condition_id, recipient_id)
       DO UPDATE SET response = EXCLUDED.response, responded_at = now()`,
      [condition.rows[0].switch_id, recipientId, conditionId, response]
    );

    await appendReceipt(condition.rows[0].switch_id, "WITNESS_CONFIRMATION_RECEIVED", {
      recipientId,
      response,
    });

    res.json({ message: "Confirmation recorded" });
  } catch (err) {
    next(err);
  }
};

module.exports = { submitConfirmation };
