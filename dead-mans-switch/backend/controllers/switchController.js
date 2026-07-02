const pool = require("../config/db");
const { logAction } = require("../utils/audit");
const { appendReceipt } = require("../utils/hashChain");

const createSwitch = async (req, res, next) => {
  try {
    const { interval_days = 7, grace_period_hours = 48, trigger_mode = "ALL" } = req.body;
    const result = await pool.query(
      `INSERT INTO switches (user_id, interval_days, grace_period_hours, trigger_mode)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, interval_days, grace_period_hours, trigger_mode]
    );
    const sw = result.rows[0];
    await logAction(req.user.id, "SWITCH_CREATED", req, { switchId: sw.id });
    await appendReceipt(sw.id, "SWITCH_CREATED");
    res.status(201).json({ switch: sw });
  } catch (err) {
    next(err);
  }
};

const listSwitches = async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT * FROM switches WHERE user_id = $1 ORDER BY created_at DESC",
      [req.user.id]
    );
    res.json({ switches: result.rows });
  } catch (err) {
    next(err);
  }
};

const getSwitch = async (req, res, next) => {
  res.json({ switch: req.switch });
};

const updateSwitch = async (req, res, next) => {
  try {
    const { interval_days, grace_period_hours, trigger_mode, status } = req.body;
    const result = await pool.query(
      `UPDATE switches SET
         interval_days = COALESCE($1, interval_days),
         grace_period_hours = COALESCE($2, grace_period_hours),
         trigger_mode = COALESCE($3, trigger_mode),
         status = COALESCE($4, status)
       WHERE id = $5 RETURNING *`,
      [interval_days, grace_period_hours, trigger_mode, status, req.params.switchId]
    );
    await logAction(req.user.id, "SWITCH_UPDATED", req, { switchId: req.params.switchId, body: req.body });
    res.json({ switch: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// The core "I'm alive" action. Resets the timer, logs the event, and
// appends a hash-chained proof-of-life receipt.
const checkIn = async (req, res, next) => {
  try {
    const switchId = req.params.switchId;

    const result = await pool.query(
      `UPDATE switches
       SET last_check_in = now(), status = 'ACTIVE'
       WHERE id = $1 RETURNING *`,
      [switchId]
    );

    await pool.query(
      `INSERT INTO check_in_events (switch_id, status, ip_address, user_agent, token_used)
       VALUES ($1, 'SUCCESS', $2, $3, $4)`,
      [switchId, req.ip, req.headers["user-agent"] || null, req.body?.token || null]
    );

    const receipt = await appendReceipt(switchId, "CHECK_IN", { via: req.body?.via || "dashboard" });
    await logAction(req.user.id, "CHECK_IN", req, { switchId });

    res.json({ switch: result.rows[0], receipt });
  } catch (err) {
    next(err);
  }
};

const getAuditTrail = async (req, res, next) => {
  try {
    const events = await pool.query(
      "SELECT * FROM check_in_events WHERE switch_id = $1 ORDER BY created_at DESC LIMIT 50",
      [req.params.switchId]
    );
    const receipts = await pool.query(
      "SELECT * FROM proof_of_life_receipts WHERE switch_id = $1 ORDER BY created_at DESC LIMIT 50",
      [req.params.switchId]
    );
    res.json({ checkIns: events.rows, receipts: receipts.rows });
  } catch (err) {
    next(err);
  }
};

module.exports = { createSwitch, listSwitches, getSwitch, updateSwitch, checkIn, getAuditTrail };
