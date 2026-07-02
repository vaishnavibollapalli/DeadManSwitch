const pool = require("../config/db");

const STEPS = [
  "step_account_created",
  "step_email_verified",
  "step_switch_created",
  "step_first_vault",
  "step_recipient_added",
  "step_recipient_verified",
  "step_release_channel_set",
  "step_trigger_conditions_set",
  "step_reviewed_and_activated",
];

async function ensureRow(userId) {
  await pool.query(
    `INSERT INTO onboarding_progress (user_id, step_account_created)
     VALUES ($1, now())
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
}

const getProgress = async (req, res, next) => {
  try {
    await ensureRow(req.user.id);
    const result = await pool.query("SELECT * FROM onboarding_progress WHERE user_id = $1", [req.user.id]);
    res.json({ progress: result.rows[0], totalSteps: STEPS.length });
  } catch (err) {
    next(err);
  }
};

const markStep = async (req, res, next) => {
  try {
    const { step } = req.body;
    if (!STEPS.includes(step)) {
      return res.status(400).json({ message: `step must be one of ${STEPS.join(", ")}` });
    }
    await ensureRow(req.user.id);
    const result = await pool.query(
      `UPDATE onboarding_progress SET ${step} = now(), updated_at = now()
       WHERE user_id = $1 RETURNING *`,
      [req.user.id]
    );
    res.json({ progress: result.rows[0], totalSteps: STEPS.length });
  } catch (err) {
    next(err);
  }
};

module.exports = { getProgress, markStep, STEPS };
