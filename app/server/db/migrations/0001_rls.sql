-- Defense-in-depth tenant isolation.
-- Application code runs every tenant request inside a transaction that sets:
--   app.workspace_id, app.user_id, app.role   (set_config(..., true) = transaction-local)
-- and then `SET LOCAL ROLE app_user`. The policies below make it impossible for a query in
-- that context to read or write another workspace's rows, even if application code forgets a filter.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END $$;--> statement-breakpoint
GRANT app_user TO CURRENT_USER;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_user;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;--> statement-breakpoint

CREATE FUNCTION app_workspace_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.workspace_id', true), '')::uuid $$;--> statement-breakpoint
CREATE FUNCTION app_user_id() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.user_id', true), '') $$;--> statement-breakpoint
CREATE FUNCTION app_role() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT coalesce(nullif(current_setting('app.role', true), ''), 'none') $$;--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organization', 'stakeholder_access', 'stakeholder_organization', 'stakeholder_group',
    'stakeholder_group_member', 'initiative', 'initiative_stakeholder', 'relationship', 'engagement',
    'engagement_participant', 'decision', 'decision_stakeholder', 'commitment', 'workspace_counter', 'idempotency_key'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (workspace_id = app_workspace_id()) WITH CHECK (workspace_id = app_workspace_id())', t);
  END LOOP;
END $$;--> statement-breakpoint

-- Stakeholders: tenant boundary + record-level restriction.
ALTER TABLE stakeholder ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON stakeholder TO app_user;--> statement-breakpoint
CREATE POLICY tenant_isolation ON stakeholder
  USING (
    workspace_id = app_workspace_id()
    AND (
      NOT restricted
      OR app_role() IN ('owner', 'admin')
      OR EXISTS (SELECT 1 FROM stakeholder_access a WHERE a.stakeholder_id = stakeholder.id AND a.user_id = app_user_id())
    )
  )
  WITH CHECK (workspace_id = app_workspace_id());--> statement-breakpoint

-- Activity history: readable and appendable within the tenant, never edited.
ALTER TABLE activity_event ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT ON activity_event TO app_user;--> statement-breakpoint
CREATE POLICY tenant_isolation ON activity_event
  USING (workspace_id = app_workspace_id()) WITH CHECK (workspace_id = app_workspace_id());--> statement-breakpoint

-- Audit trail: append-only for the application role; reads go through the privileged connection
-- in an admin-only endpoint.
GRANT INSERT ON audit_event TO app_user;--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON audit_event FROM app_user;--> statement-breakpoint

-- Read-only references the tenant role needs for joins, each limited to the current workspace.
GRANT SELECT ON workspace, membership TO app_user;--> statement-breakpoint
ALTER TABLE workspace ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON workspace FOR SELECT USING (id = app_workspace_id());--> statement-breakpoint
ALTER TABLE membership ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON membership FOR SELECT USING (workspace_id = app_workspace_id());--> statement-breakpoint
GRANT SELECT (id, name, email, image) ON "user" TO app_user;--> statement-breakpoint
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY workspace_members ON "user" FOR SELECT USING (
  EXISTS (SELECT 1 FROM membership m WHERE m.user_id = "user".id AND m.workspace_id = app_workspace_id())
);
