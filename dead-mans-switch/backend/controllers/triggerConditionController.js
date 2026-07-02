const pool = require("../config/db");
const { logAction } = require("../utils/audit");

const CONDITION_TYPES = [
  "CHECKIN_TIMER",
  "LOCATION_HEARTBEAT",
  "BIOMETRIC",
  "WITNESS_QUORUM",
  "SERVER_QUORUM",
];

// config shapes by condition_type (validated loosely, stored as JSONB):
//   CHECKIN_TIMER:      { intervalDays, graceHours }
//   LOCATION_HEARTBEAT:  { safeZoneLat, safeZoneLng, radiusMeters, maxSilenceDays }
//   BIOMETRIC:           { provider, maxSilenceDays }   // e.g. phone step/heartrate API
//   WITNESS_QUORUM:      { required, of }               // e.g. 2-of-3
//   SERVER_QUORUM:       { requiredNodes }

const addCondition = async (req, res, next) => {
  try {
    const { condition_type, config = {} } = req.body;
    if (!CONDITION_TYPES.includes(condition_type)) {
      return res.status(400).json({ message: `condition_type must be one of ${CONDITION_TYPES.join(", ")}` });
    }
    const result = await pool.query(
      `INSERT INTO trigger_conditions (switch_id, condition_type, config)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.params.switchId, condition_type, config]
    );
    await logAction(req.user.id, "TRIGGER_CONDITION_ADDED", req, { conditionId: result.rows[0].id });
    res.status(201).json({ condition: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

const listConditions = async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT * FROM trigger_conditions WHERE switch_id = $1 ORDER BY created_at ASC",
      [req.params.switchId]
    );
    res.json({ conditions: result.rows });
  } catch (err) {
    next(err);
  }
};

const updateCondition = async (req, res, next) => {
  try {
    const { config, is_active } = req.body;
    const result = await pool.query(
      `UPDATE trigger_conditions SET
         config = COALESCE($1, config),
         is_active = COALESCE($2, is_active)
       WHERE id = $3 AND switch_id = $4 RETURNING *`,
      [config, is_active, req.params.conditionId, req.params.switchId]
    );
    res.json({ condition: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

const deleteCondition = async (req, res, next) => {
  try {
    await pool.query("DELETE FROM trigger_conditions WHERE id = $1 AND switch_id = $2", [
      req.params.conditionId,
      req.params.switchId,
    ]);
    res.json({ message: "Condition removed" });
  } catch (err) {
    next(err);
  }
};

module.exports = { addCondition, listConditions, updateCondition, deleteCondition, CONDITION_TYPES };
