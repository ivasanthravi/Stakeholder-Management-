-- Row-level security for the AI layer (same model as 0001_rls.sql).

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['meeting_analysis', 'ai_proposal'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (workspace_id = app_workspace_id()) WITH CHECK (workspace_id = app_workspace_id())', t);
  END LOOP;
END $$;--> statement-breakpoint

-- Usage: appendable and readable within the tenant; never edited by the app role.
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT ON ai_usage TO app_user;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE ai_usage_id_seq TO app_user;--> statement-breakpoint
CREATE POLICY tenant_isolation ON ai_usage USING (workspace_id = app_workspace_id()) WITH CHECK (workspace_id = app_workspace_id());--> statement-breakpoint

-- Conversations, messages and cached briefings are private to the user who created them.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_conversation', 'ai_message', 'ai_cache'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', t);
    EXECUTE format('CREATE POLICY owner_only ON %I USING (workspace_id = app_workspace_id() AND user_id = app_user_id()) WITH CHECK (workspace_id = app_workspace_id() AND user_id = app_user_id())', t);
  END LOOP;
END $$;
