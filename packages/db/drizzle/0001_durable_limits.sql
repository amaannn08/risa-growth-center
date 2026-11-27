ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "client_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_counters" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);

--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN IF NOT EXISTS "observation" jsonb;
