const pool = require("../config/db");

async function logAction(userId, action, req, metadata = {}) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, metadata, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        userId,
        action,
        JSON.stringify(metadata),
        req?.ip || null,
        req?.headers?.["user-agent"] || null,
      ]
    );
  } catch (err) {
    // Audit logging must never break the primary request.
    console.error("Audit log write failed:", err.message);
  }
}

module.exports = { logAction };
