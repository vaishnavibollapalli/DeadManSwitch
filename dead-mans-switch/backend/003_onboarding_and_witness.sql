-- Consumer-grade onboarding: one row per user, 9 timestamped steps.
-- steps_completed is generated so the frontend wizard always knows exactly
-- where a new user left off without computing it client-side.
CREATE TABLE IF NOT EXISTS onboarding_progress (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  step_account_created TIMESTAMPTZ,
  step_email_verified TIMESTAMPTZ,
  step_switch_created TIMESTAMPTZ,
  step_first_vault TIMESTAMPTZ,
  step_recipient_added TIMESTAMPTZ,
  step_recipient_verified TIMESTAMPTZ,
  step_release_channel_set TIMESTAMPTZ,
  step_trigger_conditions_set TIMESTAMPTZ,
  step_reviewed_and_activated TIMESTAMPTZ,
  steps_completed INTEGER GENERATED ALWAYS AS (
    (step_account_created IS NOT NULL)::int +
    (step_email_verified IS NOT NULL)::int +
    (step_switch_created IS NOT NULL)::int +
    (step_first_vault IS NOT NULL)::int +
    (step_recipient_added IS NOT NULL)::int +
    (step_recipient_verified IS NOT NULL)::int +
    (step_release_channel_set IS NOT NULL)::int +
    (step_trigger_conditions_set IS NOT NULL)::int +
    (step_reviewed_and_activated IS NOT NULL)::int
  ) STORED,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lets a WITNESS_QUORUM trigger condition actually be evaluated: each
-- witness (a recipient acting as a witness) posts a signed confirmation
-- when asked "is the account holder still alive/reachable?".
CREATE TABLE IF NOT EXISTS witness_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  switch_id UUID NOT NULL REFERENCES switches(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
  condition_id UUID NOT NULL REFERENCES trigger_conditions(id) ON DELETE CASCADE,
  response TEXT NOT NULL CHECK (response IN ('CONFIRMED_ALIVE', 'CANNOT_CONFIRM', 'CONFIRMED_DECEASED')),
  responded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (condition_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_progress_updated_at ON onboarding_progress(updated_at);
CREATE INDEX IF NOT EXISTS idx_witness_confirmations_condition_id ON witness_confirmations(condition_id);

-- Needed for the heartbeat-node upsert (ON CONFLICT (node_name) DO UPDATE).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'heartbeat_nodes_node_name_key'
  ) THEN
    ALTER TABLE heartbeat_nodes ADD CONSTRAINT heartbeat_nodes_node_name_key UNIQUE (node_name);
  END IF;
END $$;
