import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { audit } from "./audit.js";
import { requirePermission } from "./auth.js";
import { currentApproved, sumMoney } from "./budget-domain.js";
import { db } from "./db.js";
import { isMaterialCategory, materialCategoryWhere } from "./material-category.js";

export const materialsRouter = Router();
const asyncRoute = (fn: any) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res, next)).catch(next);
const money = z
  .union([z.string(), z.number()])
  .transform((value) => new Prisma.Decimal(value))
  .refine(
    (value) => value.isFinite() && value.greaterThanOrEqualTo(0),
    "Enter a valid non-negative amount.",
  );
const materialSchema = z.object({
  description: z.string().trim().min(2).max(500),
  packageId: z.string().min(1),
  tradeId: z.string().min(1),
  budget: money,
  currency: z.enum(["SAR", "USD", "AED", "EUR"]).default("SAR"),
  status: z.enum(["ACTIVE", "CLOSED", "ON_HOLD", "CANCELLED"]),
  remarks: z.string().trim().max(2000).nullish(),
});
const poSchema = z.object({
  poNumber: z.string().trim().min(1).max(80),
  supplierName: z.string().trim().min(2).max(200),
  poDate: z.string().date(),
  poAmount: money,
  receivedMaterialValue: money,
  accruals: money,
  paid: money,
  notes: z.string().trim().max(2000).nullish(),
  status: z.enum([
    "OPEN",
    "PARTIALLY_RECEIVED",
    "FULLY_RECEIVED",
    "CLOSED",
    "CANCELLED",
  ]),
});
const supplierSchema = z.object({
  name: z.string().trim().min(2).max(200),
  active: z.boolean().default(true),
});

async function dimensions(
  projectId: string,
  packageId: string,
  tradeId: string,
) {
  const [projectPackage, trade] = await Promise.all([
    db.projectPackage.findFirst({
      where: { id: packageId, projectId, active: true },
    }),
    db.trade.findFirst({ where: { id: tradeId, projectId, active: true } }),
  ]);
  if (!projectPackage || !trade)
    throw Object.assign(
      new Error("Select a valid Package and Trade for this project."),
      { status: 400 },
    );
}

function poView(po: any) {
  const remainingMaterialAmount = po.poAmount.sub(po.receivedMaterialValue);
  const costToDate = po.accruals.add(po.paid);
  return { ...po, remainingMaterialAmount, costToDate };
}

function materialView(item: any) {
  const currentBudget = currentApproved(item.originalBudget, item.revisions);
  const activePos = item.purchaseOrders.filter(
    (po: any) => po.status !== "CANCELLED",
  );
  const totalPoAmount = sumMoney(activePos.map((po: any) => po.poAmount));
  const totalAccruals = sumMoney(activePos.map((po: any) => po.accruals));
  const totalPaid = sumMoney(activePos.map((po: any) => po.paid));
  const costToDate = totalAccruals.add(totalPaid);
  const remainingBudget = currentBudget.sub(totalPoAmount);
  return {
    ...item,
    purchaseOrders: item.purchaseOrders.map(poView),
    currentBudget,
    totalPoAmount,
    totalAccruals,
    totalPaid,
    costToDate,
    remainingBudget,
    availableToReallocate:
      item.status === "CLOSED" && remainingBudget.greaterThan(0)
        ? remainingBudget
        : new Prisma.Decimal(0),
    overBudget: remainingBudget.lessThan(0)
      ? remainingBudget.abs()
      : new Prisma.Decimal(0),
  };
}

const materialInclude = {
  category: true,
  costCode: true,
  trade: true,
  package: true,
  revisions: { orderBy: { createdAt: "asc" as const } },
  purchaseOrders: {
    include: { supplier: true },
    orderBy: [{ poDate: "desc" as const }, { createdAt: "desc" as const }],
  },
};

materialsRouter.get(
  "/projects/:projectId/materials",
  requirePermission("financial.read"),
  asyncRoute(async (req: any, res: any) => {
    const { projectId } = req.params;
    const [items, packages, trades, suppliers] = await Promise.all([
      db.budgetItem.findMany({
        where: {
          projectId,
          deletedAt: null,
          category: materialCategoryWhere,
        },
        include: materialInclude,
        orderBy: { createdAt: "asc" },
      }),
      db.projectPackage.findMany({
        where: { projectId, active: true },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      }),
      db.trade.findMany({
        where: { projectId, active: true },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      }),
      db.supplier.findMany({
        where: { projectId },
        orderBy: { name: "asc" },
      }),
    ]);
    const materials = items.map(materialView);
    const included = materials.filter((item) => item.status !== "CANCELLED");
    res.json({
      materials,
      packages,
      trades,
      suppliers,
      summary: {
        totalBudget: sumMoney(included.map((item) => item.currentBudget)),
        totalPoAmount: sumMoney(included.map((item) => item.totalPoAmount)),
        costToDate: sumMoney(included.map((item) => item.costToDate)),
        remainingBudget: sumMoney(included.map((item) => item.remainingBudget)),
        availableToReallocate: sumMoney(
          included.map((item) => item.availableToReallocate),
        ),
        overBudget: sumMoney(included.map((item) => item.overBudget)),
        currency: included[0]?.currency || "SAR",
      },
    });
  }),
);

materialsRouter.post(
  "/projects/:projectId/suppliers",
  requirePermission("financial.write"),
  asyncRoute(async (req: any, res: any) => {
    const value = supplierSchema.parse(req.body);
    const row = await db.supplier.create({
      data: { ...value, projectId: req.params.projectId },
    });
    await audit(req, {
      action: "SUPPLIER_CREATED",
      entity: "Supplier",
      entityId: row.id,
      newValue: row,
    });
    res.status(201).json(row);
  }),
);

materialsRouter.put(
  "/projects/:projectId/suppliers/:id",
  requirePermission("financial.write"),
  asyncRoute(async (req: any, res: any) => {
    const value = supplierSchema.parse(req.body);
    const oldValue = await db.supplier.findFirstOrThrow({
      where: { id: req.params.id, projectId: req.params.projectId },
    });
    const row = await db.supplier.update({
      where: { id: oldValue.id },
      data: value,
    });
    await audit(req, {
      action: value.active ? "SUPPLIER_EDITED" : "SUPPLIER_DEACTIVATED",
      entity: "Supplier",
      entityId: row.id,
      oldValue,
      newValue: row,
    });
    res.json(row);
  }),
);

materialsRouter.post(
  "/projects/:projectId/materials",
  requirePermission("financial.write"),
  asyncRoute(async (req: any, res: any) => {
    const value = materialSchema.parse(req.body);
    const { projectId } = req.params;
    await dimensions(projectId, value.packageId, value.tradeId);
    const row = await db.$transaction(async (tx) => {
      let category = await tx.costCategory.findFirst({
        where: { projectId, ...materialCategoryWhere },
      });
      if (!category)
        category = await tx.costCategory.create({
          data: { projectId, name: "Materials", code: "MAT", active: true },
        });
      const count = await tx.costCode.count({
        where: { projectId, categoryId: category.id },
      });
      const code = `MAT-${String(count + 1).padStart(3, "0")}`;
      const costCode = await tx.costCode.create({
        data: {
          projectId,
          categoryId: category.id,
          code,
          name: value.description,
        },
      });
      return tx.budgetItem.create({
        data: {
          projectId,
          categoryId: category.id,
          costCodeId: costCode.id,
          packageId: value.packageId,
          tradeId: value.tradeId,
          description: value.description,
          originalBudget: value.budget,
          currency: value.currency,
          status: value.status,
          notes: value.remarks,
        },
        include: materialInclude,
      });
    });
    await audit(req, {
      action: "MATERIAL_CREATED",
      entity: "BudgetItem",
      entityId: row.id,
      newValue: row,
    });
    res.status(201).json(materialView(row));
  }),
);

materialsRouter.put(
  "/projects/:projectId/materials/:id",
  requirePermission("financial.write"),
  asyncRoute(async (req: any, res: any) => {
    const value = materialSchema.parse(req.body);
    const { projectId, id } = req.params;
    await dimensions(projectId, value.packageId, value.tradeId);
    const oldValue = await db.budgetItem.findFirstOrThrow({
      where: { id, projectId, deletedAt: null },
      include: { revisions: true, category: true },
    });
    if (!isMaterialCategory(oldValue.category))
      throw Object.assign(new Error("This is not a Material budget item."), {
        status: 400,
      });
    const oldBudget = currentApproved(
      oldValue.originalBudget,
      oldValue.revisions,
    );
    const row = await db.$transaction(async (tx) => {
      if (!oldBudget.equals(value.budget))
        await tx.budgetRevision.create({
          data: {
            budgetItemId: id,
            amount: value.budget.sub(oldBudget),
            reason: "Material budget edited",
            createdById: req.auth?.userId,
          },
        });
      await tx.costCode.update({
        where: { id: oldValue.costCodeId },
        data: { name: value.description },
      });
      return tx.budgetItem.update({
        where: { id },
        data: {
          packageId: value.packageId,
          tradeId: value.tradeId,
          description: value.description,
          currency: value.currency,
          status: value.status,
          notes: value.remarks,
          active: value.status !== "CANCELLED",
        },
        include: materialInclude,
      });
    });
    const action =
      oldValue.status !== value.status
        ? value.status === "CLOSED"
          ? "MATERIAL_CLOSED"
          : oldValue.status === "CLOSED"
            ? "MATERIAL_REOPENED"
            : "MATERIAL_STATUS_CHANGED"
        : !oldBudget.equals(value.budget)
          ? "MATERIAL_BUDGET_CHANGED"
          : "MATERIAL_EDITED";
    await audit(req, {
      action,
      entity: "BudgetItem",
      entityId: id,
      oldValue,
      newValue: row,
    });
    res.json(materialView(row));
  }),
);

materialsRouter.post(
  "/projects/:projectId/materials/:materialId/purchase-orders",
  requirePermission("financial.write"),
  asyncRoute(async (req: any, res: any) => {
    const value = poSchema.parse(req.body);
    const { projectId, materialId } = req.params;
    const material = await db.budgetItem.findFirstOrThrow({
      where: {
        id: materialId,
        projectId,
        deletedAt: null,
        category: materialCategoryWhere,
      },
    });
    const row = await db.$transaction(async (tx) => {
      const supplier = await tx.supplier.upsert({
        where: {
          projectId_name: { projectId, name: value.supplierName },
        },
        update: { active: true },
        create: { projectId, name: value.supplierName },
      });
      return tx.materialPurchaseOrder.create({
        data: {
          projectId,
          materialId: material.id,
          supplierId: supplier.id,
          poNumber: value.poNumber,
          poDate: new Date(value.poDate),
          poAmount: value.poAmount,
          receivedMaterialValue: value.receivedMaterialValue,
          accruals: value.accruals,
          paid: value.paid,
          notes: value.notes,
          status: value.status,
        },
        include: { supplier: true },
      });
    });
    await audit(req, {
      action: "PURCHASE_ORDER_CREATED",
      entity: "MaterialPurchaseOrder",
      entityId: row.id,
      newValue: row,
    });
    res.status(201).json(poView(row));
  }),
);

materialsRouter.put(
  "/projects/:projectId/materials/:materialId/purchase-orders/:id",
  requirePermission("financial.write"),
  asyncRoute(async (req: any, res: any) => {
    const value = poSchema.parse(req.body);
    const { projectId, materialId, id } = req.params;
    const oldValue = await db.materialPurchaseOrder.findFirstOrThrow({
      where: { id, projectId, materialId },
      include: { supplier: true },
    });
    const row = await db.$transaction(async (tx) => {
      const supplier = await tx.supplier.upsert({
        where: {
          projectId_name: { projectId, name: value.supplierName },
        },
        update: { active: true },
        create: { projectId, name: value.supplierName },
      });
      return tx.materialPurchaseOrder.update({
        where: { id },
        data: {
          supplierId: supplier.id,
          poNumber: value.poNumber,
          poDate: new Date(value.poDate),
          poAmount: value.poAmount,
          receivedMaterialValue: value.receivedMaterialValue,
          accruals: value.accruals,
          paid: value.paid,
          notes: value.notes,
          status: value.status,
        },
        include: { supplier: true },
      });
    });
    const action = !oldValue.receivedMaterialValue.equals(
      value.receivedMaterialValue,
    )
      ? "RECEIVED_MATERIAL_CHANGED"
      : !oldValue.poAmount.equals(value.poAmount)
        ? "PURCHASE_ORDER_AMOUNT_CHANGED"
        : !oldValue.accruals.equals(value.accruals)
          ? "PURCHASE_ORDER_ACCRUAL_CHANGED"
          : !oldValue.paid.equals(value.paid)
            ? "PURCHASE_ORDER_PAID_CHANGED"
            : "PURCHASE_ORDER_EDITED";
    await audit(req, {
      action,
      entity: "MaterialPurchaseOrder",
      entityId: id,
      oldValue,
      newValue: row,
    });
    res.json(poView(row));
  }),
);
