CREATE TYPE "public"."roles" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."status" AS ENUM('active', 'completed', 'abandoned');--> statement-breakpoint
CREATE TABLE "images" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"mimetype" text NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "manual_chunks" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"document_id" varchar,
	"page_start" integer NOT NULL,
	"page_end" integer NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"token_count" integer NOT NULL,
	"embedding" vector(768) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "manual_documents" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"source_path" text,
	"source_type" text,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"session_id" varchar NOT NULL,
	"task_id" varchar,
	"role" "roles",
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "agent_session" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"session_id" varchar NOT NULL,
	"title" text NOT NULL,
	"status" "status",
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "manual_chunks" ADD CONSTRAINT "manual_chunks_document_id_manual_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."manual_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_session_id_agent_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_session_id_agent_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "manual_chunks_embedding_idx" ON "manual_chunks" USING hnsw ("embedding" vector_cosine_ops);