const pool = require("../config/db");

// Called by each independent infra node (e.g. a tiny cron ping from your
// AWS instance, your Fly.io instance, your Railway instance) — not by end
// users. Gated by a shared secret, not a user JWT, since these callers
// don't have accounts. This is what makes hasServerQuorum() in the
// trigger worker meaningful instead of a no-op.
const reportHeartbeat = async (req, res, next) => {
  try {
    if (process.env.HEARTBEAT_SHARED_SECRET) {
      const provided = req.headers["x-heartbeat-secret"];
      if (provided !== process.env.HEARTBEAT_SHARED_SECRET) {
        return res.status(401).json({ message: "Invalid heartbeat secret" });
      }
    }

    const { node_name, region } = req.body;
    if (!node_name) return res.status(400).json({ message: "node_name is required" });

    const result = await pool.query(
      `INSERT INTO heartbeat_nodes (node_name, region, status, last_seen)
       VALUES ($1, $2, 'ONLINE', now())
       ON CONFLICT (node_name) DO UPDATE SET status = 'ONLINE', last_seen = now(), region = EXCLUDED.region
       RETURNING *`,
      [node_name, region || null]
    );
    res.json({ node: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

const listNodes = async (req, res, next) => {
  try {
    // A node is stale (effectively OFFLINE) if it hasn't pinged in 3 minutes,
    // even if its last recorded status was ONLINE.
    const result = await pool.query(
      `SELECT *,
         CASE WHEN status = 'ONLINE' AND last_seen < now() - interval '3 minutes'
              THEN 'OFFLINE' ELSE status END AS effective_status
       FROM heartbeat_nodes ORDER BY node_name`
    );
    res.json({ nodes: result.rows });
  } catch (err) {
    next(err);
  }
};

module.exports = { reportHeartbeat, listNodes };
