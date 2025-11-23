ALTER TABLE "files" ADD COLUMN "category" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "original_format" varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "target_format" varchar(50);--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "needs_conversion" varchar(10) DEFAULT 'true' NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "converted_size" bigint;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "raw_file_path" varchar(500) NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "processed_file_path" varchar(500);--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "retry_count" bigint DEFAULT 0;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "converted_at" timestamp;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "uploaded_at" timestamp;