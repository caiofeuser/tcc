ALTER TABLE "images" ADD COLUMN "document_id" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "page_number" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_document_id_manual_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."manual_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "images_document_page_idx" ON "images" USING btree ("document_id","page_number");