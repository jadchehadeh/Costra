import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { audit } from "./audit.js";
import { requirePermission } from "./auth.js";
import { db } from "./db.js";

export const pmeRouter = Router();
const asyncRoute = (fn: any) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res, next)).catch(next);
const money = z
  .union([z.string(), z.number()])
  .transform((v) => new Prisma.Decimal(v))
  .refine(
    (v) => v.isFinite() && v.greaterThanOrEqualTo(0),
    "Enter a valid non-negative amount.",
  );
const names = [
  "Project Manager",
  "Site Engineers (Site & Sr)",
  "TECH & BIM",
  "QA/QC",
  "Surveyor",
  "DC",
  "Supervisor/Foreman",
  "Procurment",
  "Driver",
  "Logestic",
  "Equipment",
  "Staff Facility",
  "Site Offices",
  "Tools",
  "PPE",
  "Scaffolding",
  "Soft and Hardware",
  "Transportation staf",
];
const staffNames = new Set(names.slice(0, 10));

async function ensureCategories(projectId: string) {
  await db.$transaction(
    names.map((name, displayOrder) =>
      db.pmeCategory.upsert({
        where: { projectId_name: { projectId, name } },
        update: {
          displayOrder,
          kind: staffNames.has(name) ? "STAFF" : "OTHER",
        },
        create: {
          projectId,
          name,
          displayOrder,
          kind: staffNames.has(name) ? "STAFF" : "OTHER",
        },
      }),
    ),
  );
}
const monthlyView = (row: any) => ({
  ...row,
  totalAmount: row.salary.mul(row.wphPercent).toDecimalPlaces(2),
});
const employeeView = (row: any) => {
  const monthlyCosts = row.monthlyCosts.map(monthlyView);
  const totalPaid = monthlyCosts.reduce(
    (sum: Prisma.Decimal, x: any) => sum.add(x.totalAmount),
    new Prisma.Decimal(0),
  );
  return { ...row, monthlyCosts, totalPaid };
};

pmeRouter.get(
  "/projects/:projectId/pme",
  requirePermission("financial.read"),
  asyncRoute(async (req: any, res: any) => {
    const { projectId } = req.params;
    await ensureCategories(projectId);
    const [categories, employeesRaw, otherCosts] = await Promise.all([
      db.pmeCategory.findMany({
        where: { projectId },
        orderBy: { displayOrder: "asc" },
      }),
      db.pmeEmployee.findMany({
        where: { projectId },
        include: {
          category: true,
          monthlyCosts: { orderBy: { month: "desc" } },
        },
        orderBy: { employeeNumber: "asc" },
      }),
      db.pmeOtherCost.findMany({
        where: { projectId },
        include: { category: true },
        orderBy: { transactionDate: "desc" },
      }),
    ]);
    const employees = employeesRaw.map(employeeView);
    const summary = categories.map((category) => {
      const staffCost = employees
        .filter((x) => x.categoryId === category.id)
        .reduce((sum, x) => sum.add(x.totalPaid), new Prisma.Decimal(0));
      const otherCost = otherCosts
        .filter((x) => x.categoryId === category.id && x.status !== "CANCELLED")
        .reduce((sum, x) => sum.add(x.amount), new Prisma.Decimal(0));
      const costToDate = staffCost.add(otherCost);
      const remainingBudget = category.currentBudget.sub(costToDate);
      return {
        ...category,
        staffCost,
        otherCost,
        costToDate,
        remainingBudget,
        overBudget: remainingBudget.lessThan(0)
          ? remainingBudget.abs()
          : new Prisma.Decimal(0),
      };
    });
    const total = (
      field: "currentBudget" | "costToDate" | "remainingBudget" | "overBudget",
    ) => summary.reduce((sum, x) => sum.add(x[field]), new Prisma.Decimal(0));
    res.json({
      categories,
      summary,
      employees,
      otherCosts,
      totals: {
        budget: total("currentBudget"),
        costToDate: total("costToDate"),
        remainingBudget: total("remainingBudget"),
        overBudget: total("overBudget"),
        staffCost: summary.reduce(
          (s, x) => s.add(x.staffCost),
          new Prisma.Decimal(0),
        ),
        otherCost: summary.reduce(
          (s, x) => s.add(x.otherCost),
          new Prisma.Decimal(0),
        ),
        staffCount: employees.filter((x) => x.status === "ACTIVE").length,
        otherCostCount: otherCosts.filter((x) => x.status !== "CANCELLED")
          .length,
        currency: "SAR",
      },
    });
  }),
);

pmeRouter.put(
  "/projects/:projectId/pme/categories/:id/budget",
  requirePermission("financial.write"),
  asyncRoute(async (req: any, res: any) => {
    const value = z
      .object({ budget: money, reason: z.string().trim().min(5).max(500) })
      .parse(req.body);
    const oldValue = await db.pmeCategory.findFirstOrThrow({
      where: { id: req.params.id, projectId: req.params.projectId },
    });
    const row = await db.pmeCategory.update({
      where: { id: oldValue.id },
      data: {
        originalBudget: oldValue.originalBudget.equals(0)
          ? value.budget
          : oldValue.originalBudget,
        currentBudget: value.budget,
      },
    });
    await audit(req, {
      action: "PME_BUDGET_CHANGED",
      entity: "PmeCategory",
      entityId: row.id,
      oldValue,
      newValue: { ...row, reason: value.reason },
    });
    res.json(row);
  }),
);

const employeeSchema = z.object({
  employeeNumber: z.coerce.number().int().positive(),
  position: z.string().trim().min(2).max(160),
  name: z.string().trim().min(2).max(200),
  employeeId: z.string().trim().min(1).max(60),
  categoryId: z.string().min(1),
  status: z.enum(["ACTIVE", "INACTIVE", "LEFT_PROJECT"]),
  remarks: z.string().trim().max(2000).nullish(),
});
async function assertCategory(projectId: string, id: string, kind?: string) {
  const row = await db.pmeCategory.findFirst({
    where: { id, projectId, ...(kind ? { kind } : {}) },
  });
  if (!row)
    throw Object.assign(new Error("Select a valid PME category."), {
      status: 400,
    });
}
pmeRouter.post(
  "/projects/:projectId/pme/employees",
  requirePermission("financial.write"),
  asyncRoute(async (req: any, res: any) => {
    const v = employeeSchema.parse(req.body);
    await assertCategory(req.params.projectId, v.categoryId, "STAFF");
    const row = await db.pmeEmployee.create({
      data: { ...v, projectId: req.params.projectId },
      include: { category: true, monthlyCosts: true },
    });
    await audit(req, {
      action: "PME_EMPLOYEE_CREATED",
      entity: "PmeEmployee",
      entityId: row.id,
      newValue: row,
    });
    res.status(201).json(employeeView(row));
  }),
);
pmeRouter.put(
  "/projects/:projectId/pme/employees/:id",
  requirePermission("financial.write"),
  asyncRoute(async (req: any, res: any) => {
    const v = employeeSchema.parse(req.body);
    await assertCategory(req.params.projectId, v.categoryId, "STAFF");
    const oldValue = await db.pmeEmployee.findFirstOrThrow({
      where: { id: req.params.id, projectId: req.params.projectId },
    });
    const row = await db.pmeEmployee.update({
      where: { id: oldValue.id },
      data: v,
      include: { category: true, monthlyCosts: true },
    });
    await audit(req, {
      action: "PME_EMPLOYEE_EDITED",
      entity: "PmeEmployee",
      entityId: row.id,
      oldValue,
      newValue: row,
    });
    res.json(employeeView(row));
  }),
);

const monthSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  salary: money,
  wphPercent: z.coerce
    .number()
    .min(0)
    .max(100)
    .transform((v) => new Prisma.Decimal(v).div(100)),
  remarks: z.string().trim().max(2000).nullish(),
});
pmeRouter.post(
  "/projects/:projectId/pme/employees/:employeeId/monthly-costs",
  requirePermission("financial.write"),
  asyncRoute(async (req: any, res: any) => {
    const v = monthSchema.parse(req.body);
    const employee = await db.pmeEmployee.findFirstOrThrow({
      where: { id: req.params.employeeId, projectId: req.params.projectId },
    });
    const row = await db.pmeMonthlyCost.create({
      data: {
        employeeId: employee.id,
        month: new Date(`${v.month}-01T00:00:00Z`),
        salary: v.salary,
        wphPercent: v.wphPercent,
        remarks: v.remarks,
      },
    });
    await audit(req, {
      action: "PME_MONTHLY_SALARY_CREATED",
      entity: "PmeMonthlyCost",
      entityId: row.id,
      newValue: row,
    });
    res.status(201).json(monthlyView(row));
  }),
);
pmeRouter.put(
  "/projects/:projectId/pme/employees/:employeeId/monthly-costs/:id",
  requirePermission("financial.write"),
  asyncRoute(async (req: any, res: any) => {
    const v = monthSchema.parse(req.body);
    await db.pmeEmployee.findFirstOrThrow({
      where: { id: req.params.employeeId, projectId: req.params.projectId },
    });
    const oldValue = await db.pmeMonthlyCost.findFirstOrThrow({
      where: { id: req.params.id, employeeId: req.params.employeeId },
    });
    const row = await db.pmeMonthlyCost.update({
      where: { id: oldValue.id },
      data: {
        month: new Date(`${v.month}-01T00:00:00Z`),
        salary: v.salary,
        wphPercent: v.wphPercent,
        remarks: v.remarks,
      },
    });
    await audit(req, {
      action: "PME_MONTHLY_SALARY_EDITED",
      entity: "PmeMonthlyCost",
      entityId: row.id,
      oldValue,
      newValue: row,
    });
    res.json(monthlyView(row));
  }),
);
pmeRouter.delete(
  "/projects/:projectId/pme/employees/:employeeId/monthly-costs/:id",
  requirePermission("financial.write"),
  asyncRoute(async (req: any, res: any) => {
    await db.pmeEmployee.findFirstOrThrow({
      where: { id: req.params.employeeId, projectId: req.params.projectId },
    });
    const oldValue = await db.pmeMonthlyCost.delete({
      where: { id: req.params.id },
    });
    await audit(req, {
      action: "PME_MONTHLY_SALARY_DELETED",
      entity: "PmeMonthlyCost",
      entityId: oldValue.id,
      oldValue,
    });
    res.status(204).send();
  }),
);

const costSchema = z.object({
  item: z.string().trim().min(1).max(300),
  poNumber: z.string().trim().min(1).max(100),
  transactionDate: z.string().date(),
  categoryId: z.string().min(1),
  amount: money,
  remarks: z.string().trim().max(2000).nullish(),
  status: z.enum(["OPEN", "CLOSED", "CANCELLED"]),
});
pmeRouter.post(
  "/projects/:projectId/pme/other-costs",
  requirePermission("financial.write"),
  asyncRoute(async (req: any, res: any) => {
    const v = costSchema.parse(req.body);
    await assertCategory(req.params.projectId, v.categoryId, "OTHER");
    const row = await db.pmeOtherCost.create({
      data: {
        ...v,
        projectId: req.params.projectId,
        transactionDate: new Date(v.transactionDate),
      },
      include: { category: true },
    });
    await audit(req, {
      action: "PME_OTHER_COST_CREATED",
      entity: "PmeOtherCost",
      entityId: row.id,
      newValue: row,
    });
    res.status(201).json(row);
  }),
);
pmeRouter.put(
  "/projects/:projectId/pme/other-costs/:id",
  requirePermission("financial.write"),
  asyncRoute(async (req: any, res: any) => {
    const v = costSchema.parse(req.body);
    await assertCategory(req.params.projectId, v.categoryId, "OTHER");
    const oldValue = await db.pmeOtherCost.findFirstOrThrow({
      where: { id: req.params.id, projectId: req.params.projectId },
    });
    const row = await db.pmeOtherCost.update({
      where: { id: oldValue.id },
      data: { ...v, transactionDate: new Date(v.transactionDate) },
      include: { category: true },
    });
    await audit(req, {
      action: "PME_OTHER_COST_EDITED",
      entity: "PmeOtherCost",
      entityId: row.id,
      oldValue,
      newValue: row,
    });
    res.json(row);
  }),
);
pmeRouter.delete(
  "/projects/:projectId/pme/other-costs/:id",
  requirePermission("financial.write"),
  asyncRoute(async (req: any, res: any) => {
    const oldValue = await db.pmeOtherCost.findFirstOrThrow({
      where: { id: req.params.id, projectId: req.params.projectId },
    });
    const row = await db.pmeOtherCost.update({
      where: { id: oldValue.id },
      data: { status: "CANCELLED" },
    });
    await audit(req, {
      action: "PME_OTHER_COST_CANCELLED",
      entity: "PmeOtherCost",
      entityId: row.id,
      oldValue,
      newValue: row,
    });
    res.status(204).send();
  }),
);
