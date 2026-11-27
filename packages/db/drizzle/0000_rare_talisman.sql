CREATE TYPE "public"."actor" AS ENUM('user', 'copilot_confirmed', 'system');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'delete', 'reset');--> statement-breakpoint
CREATE TYPE "public"."bet_status" AS ENUM('proposed', 'approved', 'running', 'scaled', 'changed', 'stopped');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('active', 'paused', 'stopped');--> statement-breakpoint
CREATE TYPE "public"."created_via" AS ENUM('manual', 'insight', 'copilot');--> statement-breakpoint
CREATE TYPE "public"."draft_kind" AS ENUM('task', 'campaign_update', 'experiment_readout');--> statement-breakpoint
CREATE TYPE "public"."draft_status" AS ENUM('pending', 'confirmed', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."exp_status" AS ENUM('draft', 'planned', 'running', 'readout', 'scaled', 'changed', 'stopped');--> statement-breakpoint
CREATE TYPE "public"."assumption_kind" AS ENUM('sourced', 'assumption', 'data');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('p0', 'p1', 'p2');--> statement-breakpoint
CREATE TYPE "public"."reg_status" AS ENUM('interested', 'confirmed', 'cancelled', 'waitlisted');--> statement-breakpoint
CREATE TYPE "public"."rule_mode" AS ENUM('pre_event', 'post_event');--> statement-breakpoint
CREATE TYPE "public"."scenario" AS ENUM('base', 'stretch', 'all');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'in_progress', 'blocked', 'done');--> statement-breakpoint
CREATE TABLE "action_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "draft_kind" NOT NULL,
	"payload" jsonb NOT NULL,
	"evidence" jsonb,
	"status" "draft_status" DEFAULT 'pending' NOT NULL,
	"result_ref" text,
	"conversation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app_meta" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"data_revision" integer DEFAULT 1 NOT NULL,
	"dataset_revision" integer DEFAULT 1 NOT NULL,
	"seeded_at" timestamp with time zone,
	"source_sha256" text,
	"edits_since_reset" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" "actor" NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"action" "audit_action" NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"data_revision" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bets" (
	"id" text PRIMARY KEY NOT NULL,
	"rank" integer NOT NULL,
	"name" text NOT NULL,
	"mechanism" text,
	"impact" numeric(3, 1) NOT NULL,
	"confidence" numeric(3, 1) NOT NULL,
	"ease" numeric(3, 1) NOT NULL,
	"budget_base_inr" integer,
	"budget_stretch_inr" integer,
	"owner_id" text,
	"start_offset_weeks" integer,
	"end_offset_weeks" integer,
	"status" "bet_status" DEFAULT 'proposed' NOT NULL,
	"params" jsonb
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"campaign_id" text PRIMARY KEY NOT NULL,
	"campaign_name" text NOT NULL,
	"channel" text NOT NULL,
	"target_audience" text,
	"objective" text,
	"owner_id" text,
	"owner_name" text,
	"created_at" timestamp with time zone,
	"planned_start_at" timestamp with time zone,
	"planned_end_at" timestamp with time zone,
	"status" "campaign_status" DEFAULT 'active' NOT NULL,
	"plan_budget_inr" integer,
	"notes" text,
	"provenance" text DEFAULT 'seed' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"conversation_id" text,
	"ip_hash" text,
	"question" text,
	"tool_calls" jsonb,
	"answer" text,
	"grounding" jsonb,
	"model" text,
	"latency_ms" integer,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "checkins" (
	"event_id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"registration_id" text,
	"campaign_id" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"result" text NOT NULL,
	"verification" text NOT NULL,
	"source" text NOT NULL,
	"person_name" text,
	"campaign_name" text,
	"owner_id" text,
	"owner_name" text,
	"provenance" text DEFAULT 'seed' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_marketing" (
	"activity_id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"activity_date" date NOT NULL,
	"platform" text,
	"impressions" integer NOT NULL,
	"clicks" integer NOT NULL,
	"reported_reach" integer NOT NULL,
	"landing_page_sessions" integer NOT NULL,
	"registration_starts" integer NOT NULL,
	"marketing_spend_inr" integer NOT NULL,
	"campaign_name" text,
	"owner_id" text,
	"owner_name" text,
	"provenance" text DEFAULT 'seed' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decision_rules" (
	"mode" "rule_mode" NOT NULL,
	"metric" text NOT NULL,
	"scale_op" text NOT NULL,
	"scale_value" numeric NOT NULL,
	"stop_op" text NOT NULL,
	"stop_value" numeric NOT NULL,
	"min_registered" integer DEFAULT 50 NOT NULL,
	CONSTRAINT "decision_rules_mode_metric_pk" PRIMARY KEY("mode","metric")
);
--> statement-breakpoint
CREATE TABLE "event" (
	"event_name" text PRIMARY KEY NOT NULL,
	"history_start" timestamp with time zone NOT NULL,
	"history_end" timestamp with time zone NOT NULL,
	"event_starts_at" timestamp with time zone NOT NULL,
	"event_ends_at" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"currency" text NOT NULL,
	"fictional" boolean NOT NULL,
	"provenance" text DEFAULT 'seed' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" serial PRIMARY KEY NOT NULL,
	"bet_id" text,
	"name" text NOT NULL,
	"hypothesis" text,
	"primary_kpi" text,
	"kpi_unit" text,
	"assignment_unit" text,
	"min_sample" integer,
	"scale_op" text,
	"scale_value" numeric,
	"stop_op" text,
	"stop_value" numeric,
	"change_rule" text,
	"stop_note" text,
	"guardrails" jsonb,
	"readout_date" date,
	"status" "exp_status" DEFAULT 'planned' NOT NULL,
	"observed_value" numeric,
	"observed_n" integer,
	"decision" text,
	"owner_id" text
);
--> statement-breakpoint
CREATE TABLE "field_guide" (
	"source_table" text NOT NULL,
	"field" text NOT NULL,
	"data_type" text,
	"meaning" text,
	CONSTRAINT "field_guide_source_table_field_pk" PRIMARY KEY("source_table","field")
);
--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_sha256" text,
	"per_table" jsonb NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interactions" (
	"interaction_id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"campaign_id" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"event_type" text NOT NULL,
	"detail" text,
	"person_name" text,
	"campaign_name" text,
	"owner_id" text,
	"owner_name" text,
	"provenance" text DEFAULT 'seed' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"person_id" text PRIMARY KEY NOT NULL,
	"person_name" text,
	"person_type" text NOT NULL,
	"first_touch_source" text,
	"first_seen_at" timestamp with time zone NOT NULL,
	"first_campaign_id" text,
	"first_campaign_name" text,
	"owner_id" text,
	"owner_name" text,
	"provenance" text DEFAULT 'seed' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_assumptions" (
	"key" text NOT NULL,
	"scenario" "scenario" NOT NULL,
	"group" text NOT NULL,
	"value" numeric NOT NULL,
	"unit" text,
	"label" text,
	"kind" "assumption_kind" NOT NULL,
	"source_ref" text,
	CONSTRAINT "plan_assumptions_key_scenario_pk" PRIMARY KEY("key","scenario")
);
--> statement-breakpoint
CREATE TABLE "read_me" (
	"topic" text NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "read_me_topic_description_pk" PRIMARY KEY("topic","description")
);
--> statement-breakpoint
CREATE TABLE "registration_history" (
	"history_id" text PRIMARY KEY NOT NULL,
	"registration_id" text NOT NULL,
	"person_id" text NOT NULL,
	"campaign_id" text,
	"effective_at" timestamp with time zone NOT NULL,
	"status" "reg_status" NOT NULL,
	"person_name" text,
	"campaign_name" text,
	"owner_id" text,
	"owner_name" text,
	"provenance" text DEFAULT 'seed' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"registration_id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"campaign_id" text,
	"registered_at" timestamp with time zone NOT NULL,
	"person_name" text,
	"campaign_name" text,
	"owner_id" text,
	"owner_name" text,
	"provenance" text DEFAULT 'seed' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rejected_ideas" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"mechanism" text,
	"indicative_visitors" text,
	"indicative_cost" text,
	"decision" text,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "target_versions" (
	"effective_at" timestamp with time zone PRIMARY KEY NOT NULL,
	"target_version" text NOT NULL,
	"identified_external_people_goal" integer NOT NULL,
	"registration_goal" integer NOT NULL,
	"unique_external_visitors_goal" integer NOT NULL,
	"marketing_budget_inr" integer NOT NULL,
	"note" text,
	"provenance" text DEFAULT 'seed' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"campaign_id" text,
	"owner_id" text,
	"due_date" date,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"priority" "priority" DEFAULT 'p1' NOT NULL,
	"experiment_id" integer,
	"bet_id" text,
	"insight_id" text,
	"evidence" jsonb,
	"created_via" "created_via" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"from_dataset" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_person_id_people_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("person_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_registration_id_registrations_registration_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("registration_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_campaign_id_campaigns_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("campaign_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_marketing" ADD CONSTRAINT "daily_marketing_campaign_id_campaigns_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("campaign_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_bet_id_bets_id_fk" FOREIGN KEY ("bet_id") REFERENCES "public"."bets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_person_id_people_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("person_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_campaign_id_campaigns_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("campaign_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_first_campaign_id_campaigns_campaign_id_fk" FOREIGN KEY ("first_campaign_id") REFERENCES "public"."campaigns"("campaign_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_history" ADD CONSTRAINT "registration_history_registration_id_registrations_registration_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("registration_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_person_id_people_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("person_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_campaign_id_campaigns_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("campaign_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_campaign_id_campaigns_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("campaign_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_id_team_members_owner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."team_members"("owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_bet_id_bets_id_fk" FOREIGN KEY ("bet_id") REFERENCES "public"."bets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ck_at" ON "checkins" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "ck_person" ON "checkins" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "dm_campaign_date" ON "daily_marketing" USING btree ("campaign_id","activity_date");--> statement-breakpoint
CREATE INDEX "int_person" ON "interactions" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "int_at" ON "interactions" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "rh_reg" ON "registration_history" USING btree ("registration_id","effective_at" DESC NULLS LAST,"history_id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "rh_reg_eff" ON "registration_history" USING btree ("registration_id","effective_at");