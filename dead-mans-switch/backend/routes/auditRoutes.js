const express = require("express");
const pool = require("../config/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT * FROM audit_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100",
      [req.user.id]
    );
    res.json({ logs: result.rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
