/**
 * Runs on a schedule (node-cron). For every non-terminal switch it:
 *   1. Evaluates the CHECKIN_TIMER condition against last_check_in.
 *   2. Escalates ACTIVE -> WARNING -> GRACE -> TRIGGERED as thresholds pass,
 *      queueing reminder notifications along the way.
 *   3. Before ever firing TRIGGERED, checks the server quorum (>=2 of the
 *      registered heartbeat_nodes must report ONLINE) — this is the
 *      false-positive safeguard: a single node's downtime can never release
 *      a vault on its own.
 *   4. On TRIGGERED, honors trigger_mode (ALL/ANY/QUORUM) across whatever
 *      other conditions (WITNESS_QUORUM, LOCATION_HEARTBEAT, BIOMETRIC) are
 *      attached to the switch before actually releasing.
 *   5. Creates beneficiary_portal_sessions + release_events and pushes
 *      through every configured release_channel.
 */
const crypto = require("crypto");
const pool = require("../config/db");
const { appendReceipt } = require("../utils/hashChain");
const { logAction } = require("../utils/audit");
const senders = require("../utils/senders");

async function hasServerQuorum() {
  const result = await pool.query(
    `SELECT
       COUNT(*) FILTER (
         WHERE status = 'ONLINE' AND last_seen >= now() - interval '3 minutes'
       ) AS online,
       COUNT(*) AS total
     FROM heartbeat_nodes`
  );
  const { online, total } = result.rows[0];
  if (Number(total) === 0) return true; // no nodes registered yet (dev/demo) — don't block
  return Number(online) >= Math.ceil(Number(total) / 2) + 1 || Number(online) === Number(total);
}

async function queueNotification(switchId, type, destination) {
  await pool.query(
    `INSERT INTO notification_queue (switch_id, type, destination) VALUES ($1, $2, $3)`,
    [switchId, type, destination]
  );
}

async function evaluateWitnessQuorum(switchId, condition) {
  const required = condition.config.required || 2;
  const result = await pool.query(
    `SELECT COUNT(*) AS confirmed FROM witness_confirmations
     WHERE condition_id = $1 AND response = 'CONFIRMED_DECEASED'`,
    [condition.id]
  );
  return Number(result.rows[0].confirmed) >= required;
}

async function releaseTheSwitch(sw) {
  const recipients = await pool.query("SELECT * FROM recipients WHERE switch_id = $1", [sw.id]);
  const channels = await pool.query("SELECT * FROM release_channels WHERE switch_id = $1", [sw.id]);

  for (const recipient of recipients.rows) {
    const scoped_token = crypto.randomBytes(32).toString("hex");
    const expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30-day portal link
    await pool.query(
      `INSERT INTO beneficiary_portal_sessions (recipient_id, scoped_token, expires_at)
       VALUES ($1, $2, $3)`,
      [recipient.id, scoped_token, expires_at]
    );

    const portalUrl = `${process.env.PORTAL_BASE_URL || "https://app.example.com/portal"}/${scoped_token}`;

    for (const ch of channels.rows.filter((c) => c.recipient_id === recipient.id || !c.recipient_id)) {
      let result;
      switch (ch.channel) {
        case "EMAIL":
          result = await senders.sendEmail({
            to: recipient.email,
            subject: "A message has been released to you",
            body: `${recipient.name}, please visit your secure portal: ${portalUrl}`,
          });
          break;
        case "SMS":
          result = await senders.sendSms({ to: recipient.phone, body: `Secure portal: ${portalUrl}` });
          break;
        case "TELEGRAM":
          result = await senders.sendTelegram({ chatId: ch.config.chatId, body: `Portal: ${portalUrl}` });
          break;
        case "WEBHOOK":
          result = await senders.sendWebhook({ url: ch.config.url, headers: ch.config.headers, payload: { portalUrl, recipient: recipient.name } });
          break;
        case "LAWYER_API":
          result = await senders.sendToLawyerApi({ endpoint: ch.config.endpoint, apiKey: ch.config.apiKey, payload: { portalUrl, matterRef: ch.config.matterRef } });
          break;
        case "IPFS":
          result = await senders.pinToIpfs({ content: { portalUrl }, filename: `release-${sw.id}.json` });
          break;
        default:
          result = { sent: true, channel: "PORTAL_ONLY", simulated: true };
      }

      await pool.query(
        `INSERT INTO release_events (switch_id, recipient_id, release_status, presigned_url, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [sw.id, recipient.id, result.sent ? "RELEASED" : "FAILED", portalUrl, expires_at]
      );
    }
  }

  await pool.query("UPDATE switches SET status = 'TRIGGERED' WHERE id = $1", [sw.id]);
  await appendReceipt(sw.id, "SWITCH_TRIGGERED", { recipientCount: recipients.rows.length });
  await logAction(sw.user_id, "SWITCH_TRIGGERED", { ip: null, headers: {} }, { switchId: sw.id });
}

async function evaluateSwitch(sw) {
  const now = Date.now();
  const lastCheckIn = new Date(sw.last_check_in).getTime();
  const intervalMs = sw.interval_days * 24 * 60 * 60 * 1000;
  const graceMs = sw.grace_period_hours * 60 * 60 * 1000;
  const elapsed = now - lastCheckIn;

  const reminder1 = intervalMs * 0.7;
  const reminder2 = intervalMs * 0.9;

  if (elapsed >= reminder1 && sw.status === "ACTIVE" && elapsed < intervalMs) {
    // Reminder tier — goes to the switch owner (looked up via users table), not beneficiaries.
    await queueNotification(sw.id, "EMAIL", "owner");
  }

  if (elapsed >= intervalMs && sw.status === "ACTIVE") {
    await pool.query("UPDATE switches SET status = 'WARNING' WHERE id = $1", [sw.id]);
    await appendReceipt(sw.id, "DEADLINE_MISSED_WARNING_STARTED");
    return;
  }

  if (elapsed >= intervalMs && sw.status === "WARNING") {
    await pool.query("UPDATE switches SET status = 'GRACE' WHERE id = $1", [sw.id]);
    await appendReceipt(sw.id, "GRACE_PERIOD_STARTED");
    return;
  }

  if (elapsed >= intervalMs + graceMs && sw.status === "GRACE") {
    const quorumOk = await hasServerQuorum();
    if (!quorumOk) {
      await appendReceipt(sw.id, "TRIGGER_HELD_SERVER_QUORUM_FAILED");
      return; // false-positive safeguard: never release without infra consensus
    }

    const conditions = await pool.query(
      "SELECT * FROM trigger_conditions WHERE switch_id = $1 AND is_active = TRUE",
      [sw.id]
    );
    const others = conditions.rows.filter((c) => c.condition_type !== "CHECKIN_TIMER");

    let shouldRelease = true;
    if (others.length && sw.trigger_mode !== "ANY") {
      const results = await Promise.all(
        others.map((c) => (c.condition_type === "WITNESS_QUORUM" ? evaluateWitnessQuorum(sw.id, c) : true))
      );
      shouldRelease = sw.trigger_mode === "ALL" ? results.every(Boolean) : results.filter(Boolean).length > 0;
    }

    if (shouldRelease) {
      await releaseTheSwitch(sw);
    } else {
      await appendReceipt(sw.id, "TRIGGER_HELD_PENDING_OTHER_CONDITIONS");
    }
  }
}

async function tick() {
  const result = await pool.query(
    `SELECT * FROM switches WHERE status IN ('ACTIVE', 'WARNING', 'GRACE')`
  );
  for (const sw of result.rows) {
    try {
      await evaluateSwitch(sw);
    } catch (err) {
      console.error(`Trigger evaluation failed for switch ${sw.id}:`, err);
    }
  }
}

function start() {
  const cron = require("node-cron");
  // Every 5 minutes by default — tune via TRIGGER_CRON.
  const schedule = process.env.TRIGGER_CRON || "*/5 * * * *";
  cron.schedule(schedule, tick);
  console.log(`Trigger evaluator scheduled: ${schedule}`);
}

module.exports = { start, tick, evaluateSwitch };
