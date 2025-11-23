ALTER TABLE "files" ADD COLUMN "import_source" varchar(50) DEFAULT 'upload' NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "source_url" text;