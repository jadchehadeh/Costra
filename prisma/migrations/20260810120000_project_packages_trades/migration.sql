CREATE TABLE "ProjectPackage" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectPackage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Trade" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BudgetItem" ADD COLUMN "tradeId" TEXT;
ALTER TABLE "BudgetItem" ADD COLUMN "packageId" TEXT;

CREATE UNIQUE INDEX "ProjectPackage_projectId_name_key" ON "ProjectPackage"("projectId", "name");
CREATE INDEX "ProjectPackage_projectId_displayOrder_idx" ON "ProjectPackage"("projectId", "displayOrder");
CREATE UNIQUE INDEX "Trade_projectId_name_key" ON "Trade"("projectId", "name");
CREATE INDEX "Trade_projectId_displayOrder_idx" ON "Trade"("projectId", "displayOrder");
CREATE INDEX "BudgetItem_tradeId_idx" ON "BudgetItem"("tradeId");
CREATE INDEX "BudgetItem_packageId_idx" ON "BudgetItem"("packageId");

ALTER TABLE "ProjectPackage" ADD CONSTRAINT "ProjectPackage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BudgetItem" ADD CONSTRAINT "BudgetItem_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BudgetItem" ADD CONSTRAINT "BudgetItem_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ProjectPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Trade" ("id", "projectId", "name", "active", "displayOrder", "updatedAt")
SELECT 'trade-' || "id" || '-mechanical', "id", 'Mechanical', true, 0, CURRENT_TIMESTAMP FROM "Project";
INSERT INTO "Trade" ("id", "projectId", "name", "active", "displayOrder", "updatedAt")
SELECT 'trade-' || "id" || '-electrical', "id", 'Electrical', true, 1, CURRENT_TIMESTAMP FROM "Project";
INSERT INTO "Trade" ("id", "projectId", "name", "active", "displayOrder", "updatedAt")
SELECT 'trade-' || "id" || '-general', "id", 'General', true, 2, CURRENT_TIMESTAMP FROM "Project";
