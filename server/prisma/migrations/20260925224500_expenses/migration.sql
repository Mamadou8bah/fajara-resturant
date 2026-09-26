-- CreateTable
CREATE TABLE IF NOT EXISTS "expenses" (
    "id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "category" TEXT NOT NULL,
    "note" TEXT,
    "spent_at" TIMESTAMP(3) NOT NULL,
    "actor_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "expenses_spent_at_idx" ON "expenses"("spent_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "expenses_actor_id_idx" ON "expenses"("actor_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "expenses" ADD CONSTRAINT "expenses_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
