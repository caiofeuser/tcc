CREATE TYPE "public"."task_status" AS ENUM('pending', 'completed', 'skipped');--> statement-breakpoint
CREATE TABLE "checklists" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"session_id" varchar NOT NULL,
	"title" text NOT NULL,
	"source_question" text NOT NULL,
	"status" "status" DEFAULT 'active' NOT NULL,
	"current_task_index" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_session_id_agent_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checklists_session_status_idx" ON "checklists" USING btree ("session_id","status");--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "checklist_id" varchar;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "status" TYPE "public"."task_status" USING CASE WHEN "status"::text = 'completed' THEN 'completed'::public.task_status ELSE 'pending'::public.task_status END;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_checklist_id_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_checklist_position_idx" ON "tasks" USING btree ("checklist_id","position");
