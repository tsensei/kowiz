CREATE TABLE "notification_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"batch_id" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"total_files" integer NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_error" text,
	CONSTRAINT "notification_requests_batch_id_unique" UNIQUE("batch_id")
);
--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "batch_id" varchar(255);--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "notify_on_complete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "conversion_progress" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "notification_requests" ADD CONSTRAINT "notification_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;