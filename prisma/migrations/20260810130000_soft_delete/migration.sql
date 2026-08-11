ALTER TABLE "Project" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "BudgetItem" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "Project_deletedAt_idx" ON "Project"("deletedAt");
CREATE INDEX "BudgetItem_deletedAt_idx" ON "BudgetItem"("deletedAt");
