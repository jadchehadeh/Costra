CREATE TABLE "BudgetReallocation" (
  "id" TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
  "sourceBudgetItemId" TEXT NOT NULL REFERENCES "BudgetItem"("id") ON DELETE RESTRICT,
  "targetBudgetItemId" TEXT NOT NULL REFERENCES "BudgetItem"("id") ON DELETE RESTRICT,
  "amount" DECIMAL(18,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "reference" TEXT NOT NULL UNIQUE,
  "createdById" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "BudgetReallocation_projectId_createdAt_idx" ON "BudgetReallocation"("projectId", "createdAt");
CREATE INDEX "BudgetReallocation_sourceBudgetItemId_idx" ON "BudgetReallocation"("sourceBudgetItemId");
CREATE INDEX "BudgetReallocation_targetBudgetItemId_idx" ON "BudgetReallocation"("targetBudgetItemId");
