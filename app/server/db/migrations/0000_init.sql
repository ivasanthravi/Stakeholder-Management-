CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_id" text,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"verb" text NOT NULL,
	"summary" text NOT NULL,
	"changes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" uuid,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"metadata" jsonb,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commitment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"owner_id" text,
	"stakeholder_id" uuid,
	"initiative_id" uuid,
	"direction" text DEFAULT 'ours' NOT NULL,
	"due_date" date,
	"status" text DEFAULT 'open' NOT NULL,
	"completed_at" timestamp with time zone,
	"source_engagement_id" uuid,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "decision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"context" text,
	"initiative_id" uuid,
	"owner_id" text,
	"status" text DEFAULT 'proposed' NOT NULL,
	"due_date" date,
	"outcome" text,
	"decided_at" timestamp with time zone,
	"source_engagement_id" uuid,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "decision_ws_id_uq" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "decision_stakeholder" (
	"workspace_id" uuid NOT NULL,
	"decision_id" uuid NOT NULL,
	"stakeholder_id" uuid NOT NULL,
	"role" text DEFAULT 'consulted' NOT NULL,
	CONSTRAINT "decision_stakeholder_decision_id_stakeholder_id_pk" PRIMARY KEY("decision_id","stakeholder_id")
);
--> statement-breakpoint
CREATE TABLE "engagement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"initiative_id" uuid,
	"summary" text,
	"notes" text,
	"owner_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "engagement_ws_id_uq" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "engagement_participant" (
	"workspace_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"stakeholder_id" uuid NOT NULL,
	"attendance" text DEFAULT 'attended' NOT NULL,
	CONSTRAINT "engagement_participant_engagement_id_stakeholder_id_pk" PRIMARY KEY("engagement_id","stakeholder_id")
);
--> statement-breakpoint
CREATE TABLE "idempotency_key" (
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"user_id" text NOT NULL,
	"status" integer NOT NULL,
	"body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_key_workspace_id_user_id_key_pk" PRIMARY KEY("workspace_id","user_id","key")
);
--> statement-breakpoint
CREATE TABLE "initiative" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"owner_id" text,
	"start_date" date,
	"end_date" date,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "initiative_ws_id_uq" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "initiative_stakeholder" (
	"workspace_id" uuid NOT NULL,
	"initiative_id" uuid NOT NULL,
	"stakeholder_id" uuid NOT NULL,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	CONSTRAINT "initiative_stakeholder_initiative_id_stakeholder_id_pk" PRIMARY KEY("initiative_id","stakeholder_id")
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" text,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "mail_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"text" text NOT NULL,
	"url" text,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"type" text DEFAULT 'other' NOT NULL,
	"website" text,
	"description" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"parent_id" uuid,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "organization_ws_id_uq" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "relationship" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_stakeholder_id" uuid,
	"source_organization_id" uuid,
	"target_stakeholder_id" uuid,
	"target_organization_id" uuid,
	"type" text NOT NULL,
	"directed" boolean DEFAULT true NOT NULL,
	"description" text,
	"strength" smallint,
	"initiative_id" uuid,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "rel_one_source_ck" CHECK (num_nonnulls("relationship"."source_stakeholder_id", "relationship"."source_organization_id") = 1),
	CONSTRAINT "rel_one_target_ck" CHECK (num_nonnulls("relationship"."target_stakeholder_id", "relationship"."target_organization_id") = 1),
	CONSTRAINT "rel_strength_ck" CHECK ("relationship"."strength" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "stakeholder" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"email" text,
	"phone" text,
	"location" text,
	"stakeholder_type" text DEFAULT 'individual' NOT NULL,
	"influence" smallint,
	"interest" smallint,
	"stance" text DEFAULT 'unknown' NOT NULL,
	"engagement_status" text DEFAULT 'not_engaged' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"owner_id" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"restricted" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "stakeholder_ws_id_uq" UNIQUE("workspace_id","id"),
	CONSTRAINT "stakeholder_influence_ck" CHECK ("stakeholder"."influence" between 1 and 4),
	CONSTRAINT "stakeholder_interest_ck" CHECK ("stakeholder"."interest" between 1 and 4)
);
--> statement-breakpoint
CREATE TABLE "stakeholder_access" (
	"workspace_id" uuid NOT NULL,
	"stakeholder_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "stakeholder_access_stakeholder_id_user_id_pk" PRIMARY KEY("stakeholder_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "stakeholder_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "group_ws_id_uq" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "stakeholder_group_member" (
	"workspace_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"stakeholder_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stakeholder_group_member_group_id_stakeholder_id_pk" PRIMARY KEY("group_id","stakeholder_id")
);
--> statement-breakpoint
CREATE TABLE "stakeholder_organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"stakeholder_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"role" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "workspace_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "workspace_counter" (
	"workspace_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "workspace_counter_workspace_id_scope_pk" PRIMARY KEY("workspace_id","scope")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_event" ADD CONSTRAINT "activity_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_event" ADD CONSTRAINT "activity_event_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_stakeholder_fk" FOREIGN KEY ("workspace_id","stakeholder_id") REFERENCES "public"."stakeholder"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_initiative_fk" FOREIGN KEY ("workspace_id","initiative_id") REFERENCES "public"."initiative"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_engagement_fk" FOREIGN KEY ("workspace_id","source_engagement_id") REFERENCES "public"."engagement"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision" ADD CONSTRAINT "decision_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision" ADD CONSTRAINT "decision_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision" ADD CONSTRAINT "decision_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision" ADD CONSTRAINT "decision_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision" ADD CONSTRAINT "decision_initiative_fk" FOREIGN KEY ("workspace_id","initiative_id") REFERENCES "public"."initiative"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision" ADD CONSTRAINT "decision_engagement_fk" FOREIGN KEY ("workspace_id","source_engagement_id") REFERENCES "public"."engagement"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_stakeholder" ADD CONSTRAINT "decision_stakeholder_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_stakeholder" ADD CONSTRAINT "ds_decision_fk" FOREIGN KEY ("workspace_id","decision_id") REFERENCES "public"."decision"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_stakeholder" ADD CONSTRAINT "ds_stakeholder_fk" FOREIGN KEY ("workspace_id","stakeholder_id") REFERENCES "public"."stakeholder"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement" ADD CONSTRAINT "engagement_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement" ADD CONSTRAINT "engagement_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement" ADD CONSTRAINT "engagement_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement" ADD CONSTRAINT "engagement_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement" ADD CONSTRAINT "engagement_initiative_fk" FOREIGN KEY ("workspace_id","initiative_id") REFERENCES "public"."initiative"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_participant" ADD CONSTRAINT "engagement_participant_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_participant" ADD CONSTRAINT "ep_engagement_fk" FOREIGN KEY ("workspace_id","engagement_id") REFERENCES "public"."engagement"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_participant" ADD CONSTRAINT "ep_stakeholder_fk" FOREIGN KEY ("workspace_id","stakeholder_id") REFERENCES "public"."stakeholder"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_key" ADD CONSTRAINT "idempotency_key_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_stakeholder" ADD CONSTRAINT "initiative_stakeholder_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_stakeholder" ADD CONSTRAINT "initiative_stakeholder_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_stakeholder" ADD CONSTRAINT "is_initiative_fk" FOREIGN KEY ("workspace_id","initiative_id") REFERENCES "public"."initiative"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_stakeholder" ADD CONSTRAINT "is_stakeholder_fk" FOREIGN KEY ("workspace_id","stakeholder_id") REFERENCES "public"."stakeholder"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_accepted_by_user_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_parent_fk" FOREIGN KEY ("workspace_id","parent_id") REFERENCES "public"."organization"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship" ADD CONSTRAINT "relationship_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship" ADD CONSTRAINT "relationship_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship" ADD CONSTRAINT "relationship_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship" ADD CONSTRAINT "rel_src_s_fk" FOREIGN KEY ("workspace_id","source_stakeholder_id") REFERENCES "public"."stakeholder"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship" ADD CONSTRAINT "rel_src_o_fk" FOREIGN KEY ("workspace_id","source_organization_id") REFERENCES "public"."organization"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship" ADD CONSTRAINT "rel_tgt_s_fk" FOREIGN KEY ("workspace_id","target_stakeholder_id") REFERENCES "public"."stakeholder"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship" ADD CONSTRAINT "rel_tgt_o_fk" FOREIGN KEY ("workspace_id","target_organization_id") REFERENCES "public"."organization"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship" ADD CONSTRAINT "rel_initiative_fk" FOREIGN KEY ("workspace_id","initiative_id") REFERENCES "public"."initiative"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stakeholder" ADD CONSTRAINT "stakeholder_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stakeholder" ADD CONSTRAINT "stakeholder_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stakeholder" ADD CONSTRAINT "stakeholder_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stakeholder" ADD CONSTRAINT "stakeholder_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stakeholder_access" ADD CONSTRAINT "stakeholder_access_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stakeholder_access" ADD CONSTRAINT "stakeholder_access_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stakeholder_access" ADD CONSTRAINT "sa_stakeholder_fk" FOREIGN KEY ("workspace_id","stakeholder_id") REFERENCES "public"."stakeholder"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stakeholder_group" ADD CONSTRAINT "stakeholder_group_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stakeholder_group" ADD CONSTRAINT "stakeholder_group_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stakeholder_group" ADD CONSTRAINT "stakeholder_group_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stakeholder_group_member" ADD CONSTRAINT "stakeholder_group_member_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stakeholder_group_member" ADD CONSTRAINT "sgm_group_fk" FOREIGN KEY ("workspace_id","group_id") REFERENCES "public"."stakeholder_group"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stakeholder_group_member" ADD CONSTRAINT "sgm_stakeholder_fk" FOREIGN KEY ("workspace_id","stakeholder_id") REFERENCES "public"."stakeholder"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stakeholder_organization" ADD CONSTRAINT "stakeholder_organization_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stakeholder_organization" ADD CONSTRAINT "stakeholder_organization_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stakeholder_organization" ADD CONSTRAINT "stakeholder_organization_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stakeholder_organization" ADD CONSTRAINT "so_stakeholder_fk" FOREIGN KEY ("workspace_id","stakeholder_id") REFERENCES "public"."stakeholder"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stakeholder_organization" ADD CONSTRAINT "so_organization_fk" FOREIGN KEY ("workspace_id","organization_id") REFERENCES "public"."organization"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_counter" ADD CONSTRAINT "workspace_counter_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_entity_idx" ON "activity_event" USING btree ("workspace_id","entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_ws_time_idx" ON "activity_event" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_ws_time_idx" ON "audit_event" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "commitment_ws_status_due_idx" ON "commitment" USING btree ("workspace_id","status","due_date");--> statement-breakpoint
CREATE INDEX "commitment_stakeholder_idx" ON "commitment" USING btree ("stakeholder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commitment_key_uq" ON "commitment" USING btree ("workspace_id","key");--> statement-breakpoint
CREATE INDEX "decision_ws_status_idx" ON "decision" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "decision_key_uq" ON "decision" USING btree ("workspace_id","key");--> statement-breakpoint
CREATE INDEX "ds_stakeholder_idx" ON "decision_stakeholder" USING btree ("stakeholder_id");--> statement-breakpoint
CREATE INDEX "engagement_ws_time_idx" ON "engagement" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "engagement_key_uq" ON "engagement" USING btree ("workspace_id","key");--> statement-breakpoint
CREATE INDEX "ep_stakeholder_idx" ON "engagement_participant" USING btree ("stakeholder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "initiative_code_uq" ON "initiative" USING btree ("workspace_id",upper("code")) WHERE "initiative"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "is_stakeholder_idx" ON "initiative_stakeholder" USING btree ("stakeholder_id");--> statement-breakpoint
CREATE INDEX "invitation_ws_idx" ON "invitation" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_active_uq" ON "membership" USING btree ("workspace_id","user_id") WHERE "membership"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "membership_user_idx" ON "membership" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "organization_ws_idx" ON "organization" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_name_uq" ON "organization" USING btree ("workspace_id",lower("name")) WHERE "organization"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "rel_ws_idx" ON "relationship" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "rel_src_s_idx" ON "relationship" USING btree ("source_stakeholder_id");--> statement-breakpoint
CREATE INDEX "rel_tgt_s_idx" ON "relationship" USING btree ("target_stakeholder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rel_unique_active_uq" ON "relationship" USING btree ("workspace_id","type",coalesce("source_stakeholder_id", "source_organization_id"),coalesce("target_stakeholder_id", "target_organization_id")) WHERE "relationship"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stakeholder_ws_name_idx" ON "stakeholder" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "group_name_uq" ON "stakeholder_group" USING btree ("workspace_id",lower("name"));--> statement-breakpoint
CREATE INDEX "so_stakeholder_idx" ON "stakeholder_organization" USING btree ("stakeholder_id");--> statement-breakpoint
CREATE INDEX "so_org_idx" ON "stakeholder_organization" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "so_current_uq" ON "stakeholder_organization" USING btree ("stakeholder_id","organization_id") WHERE "stakeholder_organization"."valid_to" is null;--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");