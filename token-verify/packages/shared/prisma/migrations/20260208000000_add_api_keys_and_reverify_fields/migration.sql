-- CreateTable: api_keys
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "api_keys_key_hash_idx" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_project_id_idx" ON "api_keys"("project_id");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: tokens - add reverification fields
ALTER TABLE "tokens" ADD COLUMN "last_reverified_at" TIMESTAMP(3);
ALTER TABLE "tokens" ADD COLUMN "reverify_fail_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tokens" ADD COLUMN "reverify_status" TEXT NOT NULL DEFAULT 'ok';
ALTER TABLE "tokens" ADD COLUMN "reverify_grace_until" TIMESTAMP(3);
