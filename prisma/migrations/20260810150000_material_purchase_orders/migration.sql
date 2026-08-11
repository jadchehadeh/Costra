CREATE TYPE "PurchaseOrderStatus" AS ENUM ('OPEN', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CLOSED', 'CANCELLED');

CREATE TABLE "Supplier" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MaterialPurchaseOrder" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "poNumber" TEXT NOT NULL,
  "poDate" TIMESTAMP(3) NOT NULL,
  "poAmount" DECIMAL(18,2) NOT NULL,
  "receivedMaterialValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "accruals" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "paid" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MaterialPurchaseOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Supplier_projectId_name_key" ON "Supplier"("projectId", "name");
CREATE INDEX "Supplier_projectId_name_idx" ON "Supplier"("projectId", "name");
CREATE UNIQUE INDEX "MaterialPurchaseOrder_projectId_poNumber_key" ON "MaterialPurchaseOrder"("projectId", "poNumber");
CREATE INDEX "MaterialPurchaseOrder_materialId_poDate_idx" ON "MaterialPurchaseOrder"("materialId", "poDate");
CREATE INDEX "MaterialPurchaseOrder_supplierId_idx" ON "MaterialPurchaseOrder"("supplierId");
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialPurchaseOrder" ADD CONSTRAINT "MaterialPurchaseOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialPurchaseOrder" ADD CONSTRAINT "MaterialPurchaseOrder_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "BudgetItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialPurchaseOrder" ADD CONSTRAINT "MaterialPurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
