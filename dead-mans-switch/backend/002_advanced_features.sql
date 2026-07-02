CREATE TYPE trigger_mode AS ENUM (
  'ANY',
  'ALL',
  'QUORUM'
);

CREATE TYPE trigger_condition_type AS ENUM (
  'CHECKIN_TIMER',
  'LOCATION_HEARTBEAT',
  'BIOMETRIC',
  'WITNESS_QUORUM',
  'SERVER_QUORUM'
);

CREATE TYPE release_channel_type AS ENUM (
  'EMAIL',
  'SMS',
  'TELEGRAM',
  'WEBHOOK',
  'IPFS',
  'LAWYER_API',
  'PORTAL_ONLY'
);

CREATE TYPE vault_type AS ENUM (
  'GENERAL',
  'VIDEO',
  'LEGAL',
  'CRYPTO',
  'SOCIAL',
  'AI_HANDOFF',
  'PASSWORDS'
);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

ALTER TABLE switches
ADD COLUMN IF NOT EXISTS trigger_mode trigger_mode DEFAULT 'ALL';

ALTER TABLE vaults
ADD COLUMN IF NOT EXISTS vault_type vault_type DEFAULT 'GENERAL',
ADD COLUMN IF NOT EXISTS typed_metadata JSONB;

CREATE TABLE IF NOT EXISTS trigger_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  switch_id UUID NOT NULL REFERENCES switches(id) ON DELETE CASCADE,
  condition_type trigger_condition_type NOT NULL,
  config JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  last_evaluated TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS release_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  switch_id UUID NOT NULL REFERENCES switches(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES recipients(id) ON DELETE SET NULL,
  vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
  channel release_channel_type NOT NULL,
  config JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS beneficiary_portal_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
  scoped_token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_accessed TIMESTAMPTZ,
  download_log JSONB DEFAULT '[]'::jsonb,
  acknowledged BOOLEAN DEFAULT FALSE,
  delivery_receipt_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proof_of_life_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  switch_id UUID NOT NULL REFERENCES switches(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  receipt_hash TEXT NOT NULL,
  previous_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trigger_conditions_switch_id
ON trigger_conditions(switch_id);

CREATE INDEX IF NOT EXISTS idx_release_channels_switch_id
ON release_channels(switch_id);

CREATE INDEX IF NOT EXISTS idx_release_channels_recipient_id
ON release_channels(recipient_id);

CREATE INDEX IF NOT EXISTS idx_beneficiary_portal_sessions_recipient_id
ON beneficiary_portal_sessions(recipient_id);

CREATE INDEX IF NOT EXISTS idx_proof_of_life_receipts_switch_id
ON proof_of_life_receipts(switch_id);
