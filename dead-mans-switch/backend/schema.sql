CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE public.event_status AS ENUM (
    'SUCCESS',
    'MISSED',
    'WARNING_SENT',
    'GRACE_STARTED',
    'TOKEN_EXPIRED',
    'FAILED'
);

CREATE TYPE public.heartbeat_status AS ENUM (
    'ONLINE',
    'OFFLINE',
    'DEGRADED'
);

CREATE TYPE public.notification_status AS ENUM (
    'PENDING',
    'SENT',
    'FAILED',
    'RETRYING'
);

CREATE TYPE public.notification_type AS ENUM (
    'EMAIL',
    'SMS'
);

CREATE TYPE public.release_status AS ENUM (
    'PENDING',
    'RELEASED',
    'FAILED',
    'EXPIRED',
    'DOWNLOADED'
);

CREATE TYPE public.switch_status AS ENUM (
    'ACTIVE',
    'WARNING',
    'GRACE',
    'TRIGGERED',
    'PAUSED',
    'CANCELLED'
);

CREATE TABLE public.heartbeat_nodes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    node_name text NOT NULL,
    last_seen timestamptz DEFAULT now(),
    status public.heartbeat_status DEFAULT 'ONLINE'::heartbeat_status NOT NULL,
    region text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT heartbeat_nodes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    two_factor_enabled boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT users_email_key UNIQUE (email),
    CONSTRAINT users_pkey PRIMARY KEY (id)
);

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action text NOT NULL,
    created_at timestamptz DEFAULT now(),
    metadata jsonb,
    ip_address text,
    user_agent text,
    CONSTRAINT audit_logs_pkey PRIMARY KEY (id),
    CONSTRAINT audit_logs_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES public.users(id)
        ON DELETE CASCADE
);

CREATE TABLE public.switches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    status public.switch_status DEFAULT 'ACTIVE'::switch_status NOT NULL,
    interval_days integer NOT NULL,
    last_check_in timestamptz DEFAULT now() NOT NULL,
    grace_period_hours integer DEFAULT 48,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT switches_interval_days_check CHECK (interval_days > 0),
    CONSTRAINT switches_pkey PRIMARY KEY (id),
    CONSTRAINT switches_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES public.users(id)
        ON DELETE CASCADE
);

CREATE TABLE public.vaults (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    switch_id uuid NOT NULL,
    encrypted_data text NOT NULL,
    filename text,
    s3_url text,
    content_type text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT vaults_pkey PRIMARY KEY (id),
    CONSTRAINT vaults_switch_id_key UNIQUE (switch_id),
    CONSTRAINT vaults_switch_id_fkey
        FOREIGN KEY (switch_id)
        REFERENCES public.switches(id)
        ON DELETE CASCADE
);

CREATE TABLE public.check_in_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    switch_id uuid NOT NULL,
    status public.event_status NOT NULL,
    ip_address text,
    user_agent text,
    token_used text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT check_in_events_pkey PRIMARY KEY (id),
    CONSTRAINT check_in_events_switch_id_fkey
        FOREIGN KEY (switch_id)
        REFERENCES public.switches(id)
        ON DELETE CASCADE
);

CREATE TABLE public.notification_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    switch_id uuid,
    type public.notification_type NOT NULL,
    destination text NOT NULL,
    status public.notification_status DEFAULT 'PENDING'::notification_status NOT NULL,
    retry_count integer DEFAULT 0,
    scheduled_for timestamptz DEFAULT now(),
    sent_at timestamptz,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT notification_queue_pkey PRIMARY KEY (id),
    CONSTRAINT notification_queue_switch_id_fkey
        FOREIGN KEY (switch_id)
        REFERENCES public.switches(id)
        ON DELETE CASCADE
);

CREATE TABLE public.recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    switch_id uuid NOT NULL,
    name text NOT NULL,
    email text,
    phone text,
    verified boolean DEFAULT false,
    verification_token text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT recipients_pkey PRIMARY KEY (id),
    CONSTRAINT recipients_switch_id_fkey
        FOREIGN KEY (switch_id)
        REFERENCES public.switches(id)
        ON DELETE CASCADE
);

CREATE TABLE public.release_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    switch_id uuid NOT NULL,
    recipient_id uuid,
    release_status public.release_status DEFAULT 'PENDING'::release_status NOT NULL,
    presigned_url text,
    expires_at timestamptz,
    downloaded_at timestamptz,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT release_events_pkey PRIMARY KEY (id),
    CONSTRAINT release_events_recipient_id_fkey
        FOREIGN KEY (recipient_id)
        REFERENCES public.recipients(id)
        ON DELETE SET NULL,
    CONSTRAINT release_events_switch_id_fkey
        FOREIGN KEY (switch_id)
        REFERENCES public.switches(id)
        ON DELETE CASCADE
);

CREATE TABLE public.vault_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vault_id uuid NOT NULL,
    key_fragment text NOT NULL,
    fragment_index integer NOT NULL,
    holder_type text NOT NULL,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT unique_vault_fragment UNIQUE (vault_id, fragment_index),
    CONSTRAINT vault_keys_pkey PRIMARY KEY (id),
    CONSTRAINT vault_keys_vault_id_fkey
        FOREIGN KEY (vault_id)
        REFERENCES public.vaults(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_switches_user_id
ON public.switches(user_id);

CREATE INDEX idx_switches_status
ON public.switches(status);

CREATE INDEX idx_vaults_switch_id
ON public.vaults(switch_id);

CREATE INDEX idx_recipients_switch_id
ON public.recipients(switch_id);

CREATE INDEX idx_check_in_events_switch_id
ON public.check_in_events(switch_id);

CREATE INDEX idx_release_events_switch_id
ON public.release_events(switch_id);

CREATE INDEX idx_notification_queue_status
ON public.notification_queue(status);

CREATE INDEX idx_audit_logs_user_id
ON public.audit_logs(user_id);

CREATE INDEX idx_heartbeat_nodes_status
ON public.heartbeat_nodes(status);
