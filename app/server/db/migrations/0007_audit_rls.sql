-- Audit trail: the application role could insert audit events for any workspace. Writes made inside a tenant
-- transaction must now belong to that tenant (or to no workspace: account-level events such as sign-in).
-- Additive (expand-only): the previous release writes the same rows, so it keeps working after this migration.
-- The owner connection (admin-only audit reads, auth hooks) is the table owner and isn't subject to RLS.
ALTER TABLE audit_event ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_append ON audit_event FOR INSERT TO app_user
  WITH CHECK (workspace_id IS NULL OR workspace_id = app_workspace_id());
