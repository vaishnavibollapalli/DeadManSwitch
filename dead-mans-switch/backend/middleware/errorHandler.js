const pool = require("../config/db");

function errorHandler(err, req, res, next) {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    message: err.message || "Server error",
  });
}

/**
 * Confirms the authenticated user owns the switch referenced by
 * req.params.switchId before letting the request continue. Every
 * vault/trigger/recipient route hangs off a switch, so this one check
 * covers the whole resource tree.
 */
async function requireSwitchOwnership(req, res, next) {
  try {
    const { switchId } = req.params;
    const result = await pool.query(
      "SELECT id, user_id FROM switches WHERE id = $1",
      [switchId]
    );
    const sw = result.rows[0];
    if (!sw) return res.status(404).json({ message: "Switch not found" });
    if (sw.user_id !== req.user.id) {
      return res.status(403).json({ message: "Not your switch" });
    }
    req.switch = sw;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { errorHandler, requireSwitchOwnership };
