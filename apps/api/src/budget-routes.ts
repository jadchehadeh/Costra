import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db.js";
import { isMaterialCategory } from "./material-category.js";
import { requirePermission } from "./auth.js";
import { audit } from "./audit.js";
import {
  availableToReallocate,
  currentApproved,
  quantityRateAmount,
  remainingBudget,
  sumMoney,
  validateReallocation,
} from "./budget-domain.js";

export const budgetRouter = Router();
const asyncRoute = (fn: any) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res, next)).catch(next);
const code = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .transform((v) => v.toUpperCase());
const categorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).nullish(),
  active: z.boolean().default(true),
});
const costCodeSchema = z.object({
  categoryId: z.string().min(1),
  code,
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(500).nullish(),
  displayOrder: z.coerce.number().int().min(0).default(0),
  active: z.boolean().default(true),
});
const decimal = z
  .union([z.string(), z.number()])
  .transform((v) => new Prisma.Decimal(v))
  .refine(
    (v) => v.isFinite() && v.greaterThanOrEqualTo(0),
    "Amount must be a non-negative number.",
  );
const signedDecimal = z
  .union([z.string(), z.number()])
  .transform((v) => new Prisma.Decimal(v))
  .refine((v) => v.isFinite(), "Amount must be a number.");
const optionalDecimal = z
  .union([z.string(), z.number()])
  .transform((v) => new Prisma.Decimal(v))
  .refine(
    (v) => v.isFinite() && v.greaterThanOrEqualTo(0),
    "Value must be non-negative.",
  )
  .nullish();
const itemSchema = z
  .object({
    categoryId: z.string().min(1),
    costCodeId: z.string().min(1),
    description: z.string().trim().min(2).max(500),
    originalBudget: decimal.optional(),
    currency: z.enum(["SAR", "USD", "AED", "EUR"]),
    unit: z.string().trim().max(30).nullish(),
    quantity: optionalDecimal,
    unitRate: optionalDecimal,
    notes: z.string().trim().max(2000).nullish(),
    active: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (!v.originalBudget && !(v.quantity != null && v.unitRate != null))
      ctx.addIssue({
        code: "custom",
        message: "Enter an original budget or both quantity and unit rate.",
        path: ["originalBudget"],
      });
    if ((v.quantity == null) !== (v.unitRate == null))
      ctx.addIssue({
        code: "custom",
        message: "Quantity and unit rate must be supplied together.",
        path: ["quantity"],
      });
  });
const itemEditSchema = z
  .object({
    categoryId: z.string().min(1),
    costCodeId: z.string().min(1),
    description: z.string().trim().min(2).max(500),
    currency: z.enum(["SAR", "USD", "AED", "EUR"]),
    unit: z.string().trim().max(30).nullish(),
    quantity: optionalDecimal,
    unitRate: optionalDecimal,
    notes: z.string().trim().max(2000).nullish(),
    active: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if ((v.quantity == null) !== (v.unitRate == null))
      ctx.addIssue({
        code: "custom",
        message: "Quantity and unit rate must be supplied together.",
        path: ["quantity"],
      });
  });

async function assertStructure(
  projectId: string,
  categoryId: string,
  costCodeId?: string,
) {
  const category = await db.costCategory.findFirst({
    where: { id: categoryId, projectId },
  });
  if (!category)
    throw Object.assign(
      new Error("Category does not belong to this project."),
      { status: 400 },
    );
  if (costCodeId) {
    const costCode = await db.costCode.findFirst({
      where: { id: costCodeId, projectId, categoryId },
    });
    if (!costCode)
      throw Object.assign(
        new Error("Cost code does not belong to the selected category."),
        { status: 400 },
      );
  }
}
async function assertDimensions(
  projectId: string,
  categoryId: string,
  tradeId?: string | null,
  packageId?: string | null,
) {
  const category = await db.costCategory.findFirstOrThrow({
    where: { id: categoryId, projectId },
  });
  const isMaterial = isMaterialCategory(category);
  if (isMaterial && (!tradeId || !packageId))
    throw Object.assign(
      new Error("Trade and Package are required for Materials."),
      { status: 400 },
    );
  if (tradeId) {
    const trade = await db.trade.findFirst({
      where: { id: tradeId, projectId, active: true },
    });
    if (!trade)
      throw Object.assign(new Error("Trade does not belong to this project."), {
        status: 400,
      });
  }
  if (packageId) {
    const projectPackage = await db.projectPackage.findFirst({
      where: { id: packageId, projectId, active: true },
    });
    if (!projectPackage)
      throw Object.assign(
        new Error("Package does not belong to this project."),
        { status: 400 },
      );
  }
  return isMaterial;
}
async function generateCategoryCode(projectId: string, name: string) {
  const base = name
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const stem = (
    base.length > 1
      ? base.map((x) => x[0]).join("")
      : base[0]?.slice(0, 3) || "CAT"
  )
    .toUpperCase()
    .slice(0, 8);
  const existing = await db.costCategory.findMany({
    where: { projectId, code: { startsWith: stem } },
    select: { code: true },
  });
  if (!existing.some((x) => x.code === stem)) return stem;
  let suffix = 2;
  while (existing.some((x) => x.code === `${stem}${suffix}`)) suffix++;
  return `${stem}${suffix}`;
}
async function nextCostCode(projectId: string, categoryId: string) {
  const category = await db.costCategory.findFirstOrThrow({
    where: { id: categoryId, projectId },
    include: { costCodes: { select: { code: true } } },
  });
  const prefix = category.code;
  const sequence =
    category.costCodes.reduce((max, row) => {
      const match = row.code.match(/-(\d+)$/);
      return Math.max(max, match ? Number(match[1]) : 0);
    }, 0) + 1;
  return `${prefix}-${String(sequence).padStart(3, "0")}`;
}
// This boundary will aggregate Actual Costs, open commitments and accruals.
// Returning null is intentional until those authoritative modules exist.
function authoritativeCostToDate(): Prisma.Decimal | null {
  return null;
}
function effectiveCostToDate(item: {
  status: string;
  category: { name: string };
}) {
  const authoritative = authoritativeCostToDate();
  if (
    authoritative === null &&
    item.status === "CLOSED" &&
    isMaterialCategory(item.category)
  )
    return new Prisma.Decimal(0);
  return authoritative;
}
function materialFinancials(item: {
  category: { name: string };
  purchaseOrders?: Array<{
    status: string;
    poAmount: Prisma.Decimal;
    accruals: Prisma.Decimal;
    paid: Prisma.Decimal;
  }>;
}) {
  if (!isMaterialCategory(item.category)) return null;
  const purchaseOrders = (item.purchaseOrders || []).filter(
    (po) => po.status !== "CANCELLED",
  );
  return {
    committed: sumMoney(purchaseOrders.map((po) => po.poAmount)),
    costToDate: sumMoney(purchaseOrders.map((po) => po.accruals.add(po.paid))),
  };
}
budgetRouter.get(
  "/projects/:projectId/budget",
  requirePermission("financial.read"),
  asyncRoute(async (req: any, res: any) => {
    const { projectId } = req.params;
    const [categories, items, packages, trades] = await Promise.all([
      db.costCategory.findMany({
        where: { projectId },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
        include: {
          costCodes: { orderBy: [{ displayOrder: "asc" }, { code: "asc" }] },
        },
      }),
      db.budgetItem.findMany({
        where: { projectId, deletedAt: null },
        include: {
          category: true,
          costCode: true,
          trade: true,
          package: true,
          purchaseOrders: true,
          revisions: { orderBy: { createdAt: "asc" } },
        },
      }),
      db.projectPackage.findMany({
        where: { projectId },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      }),
      db.trade.findMany({
        where: { projectId },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      }),
    ]);
    const detailed = items.map((item) => {
      const current = currentApproved(item.originalBudget, item.revisions);
      const material = materialFinancials(item);
      const costToDate = material?.costToDate ?? effectiveCostToDate(item);
      const balanceBasis = material?.committed ?? costToDate;
      return {
        ...item,
        currentApprovedBudget: current,
        approvedChange: current.sub(item.originalBudget),
        costToDate,
        remainingBudget: remainingBudget(current, balanceBasis),
        availableToReallocate: availableToReallocate({
          status: item.status,
          currentBudget: current,
          costToDate: balanceBasis,
        }),
      };
    });
    const included = detailed.filter(
      (i) => i.active && i.status !== "CANCELLED",
    );
    const originalTotal = sumMoney(included.map((i) => i.originalBudget));
    const currentTotal = sumMoney(included.map((i) => i.currentApprovedBudget));
    const categorySummary = categories.map((category) => {
      const rows = included.filter((i) => i.categoryId === category.id);
      return {
        id: category.id,
        name: category.name,
        code: category.code,
        itemCount: rows.length,
        originalBudget: sumMoney(rows.map((i) => i.originalBudget)),
        currentApprovedBudget: sumMoney(
          rows.map((i) => i.currentApprovedBudget),
        ),
        costToDate: null,
        remainingBudget: null,
      };
    });
    const fundedCategoryCount = categorySummary.filter((category) =>
      category.currentApprovedBudget.greaterThan(0),
    ).length;
    res.json({
      summary: {
        totalBudget: currentTotal,
        costToDate: null,
        remainingBudget: null,
        availableForReallocation: null,
        overBudget: null,
        originalBudget: originalTotal,
        currentApprovedBudget: currentTotal,
        approvedChanges: currentTotal.sub(originalTotal),
        categoryCount: fundedCategoryCount,
        itemCount: included.length,
        currency: included[0]?.currency || "SAR",
      },
      categories,
      packages,
      trades,
      categorySummary,
      items: detailed,
    });
  }),
);
budgetRouter.post(
  "/projects/:projectId/categories",
  requirePermission("financial.write"),
  asyncRoute(async (req: any, res: any) => {
    const value = categorySchema.parse(req.body);
    const displayOrder = await db.costCategory.count({
      where: { projectId: req.params.projectId },
    });
    const generatedCode = await generateCategoryCode(
      req.params.projectId,
      value.name,
    );
    const row = await db.costCategory.create({
      data: {
        ...value,
        code: generatedCode,
        displayOrder,
        projectId: req.params.projectId,
      },
    });
    await audit(req, {
      action: "CATEGORY_CREATED",
      entity: "CostCategory",
      entityId: row.id,
      newValue: row,
    });
    res.status(201).json(row);
  }),
);
budgetRouter.put(
  "/projects/:projectId/categories/:id",
  requirePermission("financial.write"),
  asyncRoute(async (req: any, res: any) => {
    const value = categorySchema.parse(req.body);
    const oldValue = await db.costCategory.findFirstOrThrow({
      where: {
        id: req.params.id,
        projectId: req.params.projectId,
      },
    });
    const row = await db.costCategory.update({
      where: { id: oldValue.id },
      data: value,
    });
    await audit(req, {
      action:
        oldValue.active && !row.active
          ? "CATEGORY_DEACTIVATED"
          : "CATEGORY_EDITED",
      entity: "CostCategory",
      entityId: row.id,
      oldValue,
      newValue: row,
    });
    res.json(row);
  }),
);
budgetRouter.put(
  "/projects/:projectId/category-order",
  requirePermission("financial.write"),
  asyncRoute(async (req: any, res: any) => {
    const { categoryIds } = z
      .object({ categoryIds: z.array(z.string()).min(1) })
      .parse(req.body);
    const existing = await db.costCategory.findMany({
      where: { projectId: req.params.projectId, id: { in: categoryIds } },
      select: { id: true, displayOrder: true },
    });
    if (existing.length !== categoryIds.length)
      throw Object.assign(
        new Error("One or more categories do not belong to this project."),
        { status: 400 },
      );
    await db.$transaction(
      categoryIds.map((id, index) =>
        db.costCategory.update({
          where: { id },
          data: { displayOrder: index },
        }),
      ),
    );
    await audit(req, {
      action: "CATEGORY_REORDERED",
      entity: "Project",
      entityId: req.params.projectId,
      oldValue: existing,
      newValue: { categoryIds },
    });
    res.status(204).send();
  }),
);
budgetRouter.post(
  "/projects/:projectId/cost-codes",
  requirePermission("financial.write"),
  asyncRoute(async (req: any, res: any) => {
    const value = costCodeSchema.parse(req.body);
    await assertStructure(req.params.projectId, value.categoryId);
    const row = await db.costCode.create({
      data: { ...value, projectId: req.params.projectId },
    });
    await audit(req, {
      action: "CREATE",
      entity: "CostCode",
      entityId: row.id,
      newValue: row,
    });
    res.status(201).json(row);
  }),
);
budgetRouter.put(
  "/projects/:projectId/cost-codes/:id",
  requirePermission("financial.write"),
  asyncRoute(async (req: any, res: any) => {
    const value = costCodeSchema.parse(req.body);
    await assertStructure(req.params.projectId, value.categoryId);
    const oldValue = await db.costCode.findFirstOrThrow({
      where: {
        id: req.params.id,
        projectId: req.params.projectId,
      },
    });
    const row = await db.costCode.update({
      where: { id: oldValue.id },
      data: value,
    });
    await audit(req, {
      action: "UPDATE",
      entity: "CostCode",
      entityId: row.id,
      oldValue,
      newValue: row,
    });
    res.json(row);
  }),
);
budgetRouter.post(
  "/projects/:projectId/budget-items/simple",
  requirePermission("financial.write"),
  asyncRoute(async (req: any, res: any) => {
    const value = z
      .object({
        categoryId: z.string().min(1),
        tradeId: z.string().min(1).nullish(),
        packageId: z.string().min(1).nullish(),
        description: z.string().trim().min(2).max(500),
        budget: decimal,
        currency: z.enum(["SAR", "USD", "AED", "EUR"]),
        notes: z.string().trim().max(2000).nullish(),
        status: z
          .enum(["ACTIVE", "CLOSED", "ON_HOLD", "CANCELLED"])
          .default("ACTIVE"),
      })
      .parse(req.body);
    await assertStructure(req.params.projectId, value.categoryId);
    await assertDimensions(
      req.params.projectId,
      value.categoryId,
      value.tradeId,
      value.packageId,
    );
    const generatedCode = await nextCostCode(
      req.params.projectId,
      value.categoryId,
    );
    const row = await db.$transaction(async (tx) => {
      const costCode = await tx.costCode.create({
        data: {
          projectId: req.params.projectId,
          categoryId: value.categoryId,
          code: generatedCode,
          name: value.description,
          active: true,
        },
      });
      return tx.budgetItem.create({
        data: {
          projectId: req.params.projectId,
          categoryId: value.categoryId,
          costCodeId: costCode.id,
          description: value.description,
          originalBudget: value.budget,
          currency: value.currency,
          notes: value.notes,
          tradeId: value.tradeId,
          packageId: value.packageId,
          status: value.status,
          active: true,
        },
        include: { costCode: true, category: true, trade: true, package: true },
      });
    });
    await audit(req, {
      action: "BUDGET_ITEM_CREATED",
      entity: "BudgetItem",
      entityId: row.id,
      newValue: row,
    });
    res.status(201).json(row);
  }),
);
budgetRouter.put(
  "/projects/:projectId/budget-items/:id/simple",
  requirePermission("financial.write"),
  asyncRoute(async (req: any, res: any) => {
    const value = z
      .object({
        categoryId: z.string().min(1),
        tradeId: z.string().min(1).nullish(),
        packageId: z.string().min(1).nullish(),
        description: z.string().trim().min(2).max(500),
        notes: z.string().trim().max(2000).nullish(),
        status: z.enum(["ACTIVE", "CLOSED", "ON_HOLD", "CANCELLED"]),
      })
      .parse(req.body);
    await assertStructure(req.params.projectId, value.categoryId);
    await assertDimensions(
      req.params.projectId,
      value.categoryId,
      value.tradeId,
      value.packageId,
    );
    const oldValue = await db.budgetItem.findFirstOrThrow({
      where: {
        id: req.params.id,
        projectId: req.params.projectId,
        deletedAt: null,
      },
      include: { costCode: true },
    });
    const row = await db.$transaction(async (tx) => {
      await tx.costCode.update({
        where: { id: oldValue.costCodeId },
        data: { name: value.description, categoryId: value.categoryId },
      });
      return tx.budgetItem.update({
        where: { id: oldValue.id },
        data: value,
        include: { costCode: true, category: true, trade: true, package: true },
      });
    });
    await audit(req, {
      action: "BUDGET_ITEM_EDITED",
      entity: "BudgetItem",
      entityId: row.id,
      oldValue,
      newValue: row,
    });
    res.json(row);
  }),
);
budgetRouter.delete(
  "/projects/:projectId/budget-items/:id",
  requirePermission("financial.write"),
  asyncRoute(async (req: any, res: any) => {
    const oldValue = await db.budgetItem.findFirstOrThrow({
      where: {
        id: req.params.id,
        projectId: req.params.projectId,
        deletedAt: null,
      },
      include: { costCode: true },
    });
    const row = await db.$transaction(async (tx) => {
      await tx.costCode.update({
        where: { id: oldValue.costCodeId },
        data: { active: false },
      });
      return tx.budgetItem.update({
        where: { id: oldValue.id },
        data: {
          deletedAt: new Date(),
          active: false,
          status: "CANCELLED",
        },
      });
    });
    await audit(req, {
      action: "BUDGET_ITEM_DELETED",
      entity: "BudgetItem",
      entityId: row.id,
      oldValue,
      newValue: row,
    });
    res.status(204).send();
  }),
);
budgetRouter.post(
  "/projects/:projectId/budget-items",
  requirePermission("financial.write"),
  asyncRoute(async (req: any, res: any) => {
    const value = itemSchema.parse(req.body);
    await assertStructure(
      req.params.projectId,
      value.categoryId,
      value.costCodeId,
    );
    const original =
      value.originalBudget ??
      quantityRateAmount(value.quantity!, value.unitRate!);
    const row = await db.budgetItem.create({
      data: {
        ...value,
        originalBudget: original,
        projectId: req.params.projectId,
      },
    });
    await audit(req, {
      action: "BUDGET_ITEM_CREATED",
      entity: "BudgetItem",
      entityId: row.id,
      newValue: row,
    });
    res.status(201).json(row);
  }),
);
budgetRouter.put(
  "/projects/:projectId/budget-items/:id",
  requirePermission("financial.write"),
  asyncRoute(async (req: any, res: any) => {
    const value = itemEditSchema.parse(req.body);
    await assertStructure(
      req.params.projectId,
      value.categoryId,
      value.costCodeId,
    );
    const oldValue = await db.budgetItem.findFirstOrThrow({
      where: {
        id: req.params.id,
        projectId: req.params.projectId,
        deletedAt: null,
      },
    });
    const row = await db.budgetItem.update({
      where: { id: oldValue.id },
      data: value,
    });
    await audit(req, {
      action: oldValue.active && !row.active ? "DEACTIVATE" : "UPDATE",
      entity: "BudgetItem",
      entityId: row.id,
      oldValue,
      newValue: row,
    });
    res.json(row);
  }),
);
budgetRouter.post(
  "/projects/:projectId/budget-items/:id/revisions",
  requirePermission("financial.write"),
  asyncRoute(async (req: any, res: any) => {
    const value = z
      .object({
        amount: signedDecimal.refine(
          (v) => !v.equals(0),
          "Change amount cannot be zero.",
        ),
        reason: z.string().trim().min(5).max(500),
      })
      .parse(req.body);
    const item = await db.budgetItem.findFirstOrThrow({
      where: {
        id: req.params.id,
        projectId: req.params.projectId,
        deletedAt: null,
      },
      include: { revisions: true },
    });
    const before = currentApproved(item.originalBudget, item.revisions);
    if (before.add(value.amount).lessThan(0))
      throw Object.assign(
        new Error("Current approved budget cannot be negative."),
        { status: 400 },
      );
    const revision = await db.budgetRevision.create({
      data: {
        budgetItemId: item.id,
        amount: value.amount,
        reason: value.reason,
        createdById: req.auth.userId,
      },
    });
    const after = before.add(value.amount);
    await audit(req, {
      action: "CURRENT_BUDGET_CHANGED",
      entity: "BudgetItem",
      entityId: item.id,
      oldValue: { currentApprovedBudget: before },
      newValue: {
        currentApprovedBudget: after,
        revisionId: revision.id,
        reason: value.reason,
      },
    });
    res.status(201).json({ ...revision, currentApprovedBudget: after });
  }),
);
budgetRouter.post(
  "/projects/:projectId/budget-items/:id/adjust",
  requirePermission("financial.write"),
  asyncRoute(async (req: any, res: any) => {
    const value = z
      .object({
        newApprovedBudget: decimal,
        reason: z.string().trim().min(5).max(500),
      })
      .parse(req.body);
    const item = await db.budgetItem.findFirstOrThrow({
      where: { id: req.params.id, projectId: req.params.projectId },
      include: { revisions: true },
    });
    const before = currentApproved(item.originalBudget, item.revisions);
    const change = value.newApprovedBudget.sub(before);
    if (change.equals(0))
      throw Object.assign(new Error("The new approved budget is unchanged."), {
        status: 400,
      });
    const revision = await db.budgetRevision.create({
      data: {
        budgetItemId: item.id,
        amount: change,
        reason: value.reason,
        createdById: req.auth.userId,
      },
    });
    await audit(req, {
      action: "BUDGET_ADJUSTED",
      entity: "BudgetItem",
      entityId: item.id,
      oldValue: {
        originalBudget: item.originalBudget,
        currentApprovedBudget: before,
      },
      newValue: {
        originalBudget: item.originalBudget,
        currentApprovedBudget: value.newApprovedBudget,
        approvedChange: value.newApprovedBudget.sub(item.originalBudget),
        revisionId: revision.id,
        reason: value.reason,
      },
    });
    res.status(201).json({
      ...revision,
      currentApprovedBudget: value.newApprovedBudget,
      approvedChange: value.newApprovedBudget.sub(item.originalBudget),
    });
  }),
);
budgetRouter.get(
  "/projects/:projectId/budget-reallocations",
  requirePermission("financial.read"),
  asyncRoute(async (req: any, res: any) => {
    const items = await db.budgetItem.findMany({
      where: { projectId: req.params.projectId, active: true, deletedAt: null },
      include: {
        category: true,
        costCode: true,
        revisions: true,
        purchaseOrders: true,
      },
    });
    const positions = items.map((item) => {
      const budget = currentApproved(item.originalBudget, item.revisions);
      const material = materialFinancials(item);
      const costToDate = material?.costToDate ?? effectiveCostToDate(item);
      const balanceBasis = material?.committed ?? costToDate;
      return {
        id: item.id,
        description: item.description,
        category: item.category.name,
        internalCode: item.costCode.code,
        budget,
        costToDate,
        remainingBudget: remainingBudget(budget, balanceBasis),
        availableToReallocate: availableToReallocate({
          status: item.status,
          currentBudget: budget,
          costToDate: balanceBasis,
        }),
        status: item.status,
        currency: item.currency,
      };
    });
    const eligible = positions.filter(
      (item) =>
        item.availableToReallocate?.greaterThan(0) && item.status === "CLOSED",
    );
    const history = await db.budgetReallocation.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { createdAt: "desc" },
      include: {
        sourceBudgetItem: { select: { description: true } },
        targetBudgetItem: { select: { description: true } },
        createdBy: { select: { name: true } },
      },
    });
    res.json({
      availableToReallocate: eligible.length
        ? sumMoney(eligible.map((item) => item.availableToReallocate!))
        : null,
      eligible,
      targets: positions.filter((item) => item.status !== "CANCELLED"),
      history,
      calculationStatus: eligible.length
        ? "AVAILABLE"
        : "AWAITING_ACTUAL_COSTS",
      calculationNote:
        "Closed material items release their unspent approved budget. Commitments and accruals will also be deducted when those modules exist.",
    });
  }),
);
budgetRouter.post(
  "/projects/:projectId/budget-reallocations",
  requirePermission("financial.write"),
  asyncRoute(async (req: any, res: any) => {
    const value = z
      .object({
        sourceBudgetItemId: z.string().min(1),
        targetBudgetItemId: z.string().min(1).optional(),
        newTarget: z
          .object({
            categoryId: z.string().min(1),
            description: z.string().trim().min(2).max(500),
            currency: z.enum(["SAR", "USD", "AED", "EUR"]),
          })
          .optional(),
        amount: decimal.refine((amount) => amount.greaterThan(0), {
          message: "Transfer amount must be greater than zero.",
        }),
        reason: z.string().trim().min(5).max(500),
      })
      .refine(
        (body) => Boolean(body.targetBudgetItemId) !== Boolean(body.newTarget),
        {
          message: "Choose either an existing target or a new budget item.",
          path: ["targetBudgetItemId"],
        },
      )
      .parse(req.body);
    const source = await db.budgetItem.findFirstOrThrow({
      where: {
        id: value.sourceBudgetItemId,
        projectId: req.params.projectId,
        active: true,
        deletedAt: null,
      },
      include: { revisions: true, category: true, purchaseOrders: true },
    });
    const sourceBudget = currentApproved(
      source.originalBudget,
      source.revisions,
    );
    const sourceMaterial = materialFinancials(source);
    const sourceCostToDate =
      sourceMaterial?.committed ?? effectiveCostToDate(source);
    const available = availableToReallocate({
      status: source.status,
      currentBudget: sourceBudget,
      costToDate: sourceCostToDate,
    });
    if (!value.targetBudgetItemId && value.newTarget) {
      await assertStructure(req.params.projectId, value.newTarget.categoryId);
    }
    const reference = `BR-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const result = await db.$transaction(
      async (tx) => {
        let targetId = value.targetBudgetItemId;
        if (value.newTarget) {
          const generatedCode = await nextCostCode(
            req.params.projectId,
            value.newTarget.categoryId,
          );
          const costCode = await tx.costCode.create({
            data: {
              projectId: req.params.projectId,
              categoryId: value.newTarget.categoryId,
              code: generatedCode,
              name: value.newTarget.description,
            },
          });
          const target = await tx.budgetItem.create({
            data: {
              projectId: req.params.projectId,
              categoryId: value.newTarget.categoryId,
              costCodeId: costCode.id,
              description: value.newTarget.description,
              originalBudget: 0,
              currency: value.newTarget.currency,
            },
          });
          targetId = target.id;
        }
        const target = await tx.budgetItem.findFirstOrThrow({
          where: {
            id: targetId!,
            projectId: req.params.projectId,
            active: true,
            status: { not: "CANCELLED" },
            deletedAt: null,
          },
          include: { revisions: true },
        });
        const amount = validateReallocation({
          sourceId: source.id,
          targetId: target.id,
          sourceStatus: source.status,
          available,
          amount: value.amount,
        });
        const targetBefore = currentApproved(
          target.originalBudget,
          target.revisions,
        );
        const beforeTotal = sourceBudget.add(targetBefore);
        const sourceAfter = sourceBudget.sub(amount);
        const targetAfter = targetBefore.add(amount);
        if (!sourceAfter.add(targetAfter).equals(beforeTotal)) {
          throw Object.assign(
            new Error("Reallocation must preserve project budget."),
            { status: 400 },
          );
        }
        const reallocation = await tx.budgetReallocation.create({
          data: {
            projectId: req.params.projectId,
            sourceBudgetItemId: source.id,
            targetBudgetItemId: target.id,
            amount,
            reason: value.reason,
            reference,
            createdById: req.auth.userId,
          },
        });
        await tx.budgetRevision.createMany({
          data: [
            {
              budgetItemId: source.id,
              amount: amount.negated(),
              reason: `Reallocation out ${reference}: ${value.reason}`,
              createdById: req.auth.userId,
            },
            {
              budgetItemId: target.id,
              amount,
              reason: `Reallocation in ${reference}: ${value.reason}`,
              createdById: req.auth.userId,
            },
          ],
        });
        return {
          reallocation,
          sourceAfter,
          targetAfter,
          projectBudgetChange: new Prisma.Decimal(0),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    await audit(req, {
      action: "BUDGET_REALLOCATION_CREATED",
      entity: "BudgetReallocation",
      entityId: result.reallocation.id,
      newValue: result,
    });
    res.status(201).json(result);
  }),
);
budgetRouter.post(
  "/projects/:projectId/budget-import/validate",
  requirePermission("financial.write"),
  (_req, res) =>
    res.status(501).json({
      error: {
        code: "IMPORT_PARSER_NOT_IMPLEMENTED",
        message:
          "Excel parsing is the next implementation step. No records were imported.",
      },
    }),
);
