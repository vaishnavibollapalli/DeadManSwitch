const pool = require("../config/db");
const { logAction } = require("../utils/audit");

const CHANNEL_TYPES = ["EMAIL", "SMS", "TELEGRAM", "WEBHOOK", "IPFS", "LAWYER_API", "PORTAL_ONLY"];

// config shapes by channel (validated loosely, stored as JSONB):
//   EMAIL:      { } (uses recipient.email)
//   SMS:        { } (uses recipient.phone)
//   TELEGRAM:   { chatId }
//   WEBHOOK:    { url, headers }
//   IPFS:       { pinToPublicGateway: bool }
//   LAWYER_API: { firmId, matterRef }
//   PORTAL_ONLY:{ } (beneficiary must log into the portal, nothing pushed out)

const addChannel = async (req, res, next) => {
  try {
    const { channel, recipient_id, vault_id, config = {} } = req.body;
    if (!CHANNEL_TYPES.includes(channel)) {
      return res.status(400).json({ message: `channel must be one of ${CHANNEL_TYPES.join(", ")}` });
    }
    const result = await pool.query(
      `INSERT INTO release_channels (switch_id, recipient_id, vault_id, channel, config)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.switchId, recipient_id || null, vault_id || null, channel, config]
    );
    await logAction(req.user.id, "RELEASE_CHANNEL_ADDED", req, { channelId: result.rows[0].id, channel });
    res.status(201).json({ channel: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

const listChannels = async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT * FROM release_channels WHERE switch_id = $1 ORDER BY created_at ASC",
      [req.params.switchId]
    );
    res.json({ channels: result.rows });
  } catch (err) {
    next(err);
  }
};

const deleteChannel = async (req, res, next) => {
  try {
    await pool.query("DELETE FROM release_channels WHERE id = $1 AND switch_id = $2", [
      req.params.channelId,
      req.params.switchId,
    ]);
    res.json({ message: "Channel removed" });
  } catch (err) {
    next(err);
  }
};

module.exports = { addChannel, listChannels, deleteChannel, CHANNEL_TYPES };
