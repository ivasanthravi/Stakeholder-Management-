-- Row-level security for the commercial tables (same model as 0001/0003).
-- System tables (billing_event, job, ai_allowance, email_message, user_preference, analytics_event, data_request)
-- get RLS with no policy and no grants: app_user can't read or write them at all; only the server's owner connection can.

-- Members can read their own workspace's subscription; only the server writes it.
ALTER TABLE subscription ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT ON subscription TO app_user;--> statement-breakpoint
CREATE POLICY tenant_read ON subscription FOR SELECT USING (workspace_id = app_workspace_id());--> statement-breakpoint

-- Notifications are private to their recipient, who may mark them read.
ALTER TABLE notification ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, UPDATE ON notification TO app_user;--> statement-breakpoint
CREATE POLICY owner_only ON notification USING (workspace_id = app_workspace_id() AND user_id = app_user_id()) WITH CHECK (workspace_id = app_workspace_id() AND user_id = app_user_id());--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['billing_event', 'job', 'ai_allowance', 'email_message', 'user_preference', 'analytics_event', 'data_request'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON %I FROM app_user', t);
  END LOOP;
END $$;--> statement-breakpoint

-- Existing workspaces start a trial from today, so nobody loses access when entitlements switch on.
INSERT INTO subscription (workspace_id, plan, status, seats, provider, trial_ends_at, trial_started_by)
SELECT w.id, 'professional', 'trialing', 10, 'none', now() + interval '14 days', w.created_by
FROM workspace w
WHERE NOT EXISTS (SELECT 1 FROM subscription s WHERE s.workspace_id = w.id);
