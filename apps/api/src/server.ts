import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "./db.js";
import { config } from "./config.js";
import { authenticate, requirePermission, signToken } from "./auth.js";
import { audit } from "./audit.js";
import { budgetRouter } from "./budget-routes.js";
import { materialsRouter } from "./materials-routes.js";
import { pmeRouter } from "./pme-routes.js";

const app = express();
app.use(
  helmet(),
  cors({ origin: config.WEB_ORIGIN }),
  express.json({ limit: "1mb" }),
  pinoHttp(),
);
app.get("/api/health", (_req, res) =>
  res.json({ status: "ok", service: "costra-api" }),
);
const asyncRoute = (fn: any) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res, next)).catch(next);

app.post(
  "/api/auth/login",
  asyncRoute(async (req: any, res: any) => {
    const { email, password } = z
      .object({ email: z.email(), password: z.string().min(8) })
      .parse(req.body);
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });
    if (!user?.active || !(await bcrypt.compare(password, user.passwordHash)))
      return res.status(401).json({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Email or password is incorrect.",
        },
      });
    const permissions = user.role.permissions.map((x) => x.permission.key);
    const token = signToken({
      userId: user.id,
      role: user.role.key,
      permissions,
    });
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "LOGIN",
        entity: "Session",
        ipAddress: req.ip,
      },
    });
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role.name,
        roleKey: user.role.key,
        permissions,
      },
    });
  }),
);

app.use("/api", authenticate);
app.use("/api", budgetRouter);
app.use("/api", materialsRouter);
app.use("/api", pmeRouter);
app.get(
  "/api/me",
  asyncRoute(async (req: any, res: any) => {
    const user = await db.user.findUniqueOrThrow({
      where: { id: req.auth.userId },
      include: { role: true },
    });
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role.name,
      roleKey: user.role.key,
      permissions: req.auth.permissions,
    });
  }),
);
app.get(
  "/api/dashboard",
  requirePermission("projects.read"),
  asyncRoute(async (_req: any, res: any) => {
    const [totalProjects, atRisk] = await Promise.all([
      db.project.count({ where: { deletedAt: null } }),
      db.project.count({ where: { status: "ON_HOLD", deletedAt: null } }),
    ]);
    res.json({
      totalProjects,
      projectsAtRisk: atRisk,
      totalBudget: null,
      totalCommitted: null,
      actualCost: null,
      forecastFinalCost: null,
      forecastVariance: null,
    });
  }),
);
app.get(
  "/api/projects",
  requirePermission("projects.read"),
  asyncRoute(async (req: any, res: any) => {
    const query = typeof req.query.q === "string" ? req.query.q : undefined;
    const status =
      typeof req.query.status === "string" && req.query.status !== "ALL"
        ? req.query.status
        : undefined;
    res.json(
      await db.project.findMany({
        where: {
          deletedAt: null,
          status: status as any,
          OR: query
            ? [
                { name: { contains: query, mode: "insensitive" } },
                { number: { contains: query, mode: "insensitive" } },
                { client: { contains: query, mode: "insensitive" } },
              ]
            : undefined,
        },
        orderBy: { updatedAt: "desc" },
      }),
    );
  }),
);
app.get(
  "/api/projects/:id",
  requirePermission("projects.read"),
  asyncRoute(async (req: any, res: any) =>
    res.json(
      await db.project.findFirstOrThrow({
        where: { id: req.params.id, deletedAt: null },
        include: {
          packages: { orderBy: [{ displayOrder: "asc" }, { name: "asc" }] },
          trades: { orderBy: [{ displayOrder: "asc" }, { name: "asc" }] },
        },
      }),
    ),
  ),
);
const projectSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    number: z.string().trim().min(1).max(40),
    client: z.string().trim().min(2).max(120),
    projectType: z.string().trim().max(80).optional().nullable(),
    location: z.string().trim().max(120).optional().nullable(),
    contractValue: z.number().nonnegative().optional().nullable(),
    currency: z
      .string()
      .length(3)
      .transform((v) => v.toUpperCase()),
    startDate: z.string().optional().nullable(),
    plannedCompletionDate: z.string().optional().nullable(),
    status: z.enum(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CLOSED"]),
    description: z.string().max(2000).optional().nullable(),
    packages: z
      .array(
        z.object({
          id: z.string().optional(),
          name: z.string().trim().min(1).max(100),
          active: z.boolean().default(true),
        }),
      )
      .optional(),
  })
  .refine(
    (v) =>
      !v.startDate ||
      !v.plannedCompletionDate ||
      new Date(v.plannedCompletionDate) >= new Date(v.startDate),
    {
      message: "Planned completion must be after the start date.",
      path: ["plannedCompletionDate"],
    },
  );
const toProjectData = (v: any) => ({
  name: v.name,
  number: v.number,
  client: v.client,
  projectType: v.projectType,
  location: v.location,
  contractValue: v.contractValue,
  currency: v.currency,
  status: v.status,
  description: v.description,
  startDate: v.startDate ? new Date(v.startDate) : null,
  plannedCompletionDate: v.plannedCompletionDate
    ? new Date(v.plannedCompletionDate)
    : null,
});
app.post(
  "/api/projects",
  requirePermission("projects.write"),
  asyncRoute(async (req: any, res: any) => {
    const value = projectSchema.parse(req.body);
    const project = await db.project.create({
      data: {
        ...toProjectData(value),
        packages: value.packages?.length
          ? {
              create: value.packages.map((row, displayOrder) => ({
                name: row.name,
                active: row.active,
                displayOrder,
              })),
            }
          : undefined,
        trades: {
          create: ["Mechanical", "Electrical", "General"].map(
            (name, displayOrder) => ({ name, displayOrder }),
          ),
        },
      },
      include: { packages: true, trades: true },
    });
    await audit(req, {
      action: "CREATE",
      entity: "Project",
      entityId: project.id,
      newValue: project,
    });
    res.status(201).json(project);
  }),
);
app.put(
  "/api/projects/:id",
  requirePermission("projects.write"),
  asyncRoute(async (req: any, res: any) => {
    const value = projectSchema.parse(req.body);
    const oldValue = await db.project.findFirstOrThrow({
      where: { id: req.params.id, deletedAt: null },
    });
    const project = await db.$transaction(async (tx) => {
      const updated = await tx.project.update({
        where: { id: req.params.id },
        data: toProjectData(value),
      });
      if (value.packages) {
        const retainedIds = value.packages.flatMap((row) =>
          row.id ? [row.id] : [],
        );
        await tx.projectPackage.updateMany({
          where: {
            projectId: req.params.id,
            ...(retainedIds.length ? { id: { notIn: retainedIds } } : {}),
          },
          data: { active: false },
        });
        for (const [displayOrder, row] of value.packages.entries()) {
          if (row.id) {
            const existing = await tx.projectPackage.findFirstOrThrow({
              where: { id: row.id, projectId: req.params.id },
            });
            await tx.projectPackage.update({
              where: { id: existing.id },
              data: { name: row.name, active: row.active, displayOrder },
            });
          } else {
            await tx.projectPackage.create({
              data: {
                projectId: req.params.id,
                name: row.name,
                active: row.active,
                displayOrder,
              },
            });
          }
        }
      }
      return tx.project.findUniqueOrThrow({
        where: { id: updated.id },
        include: {
          packages: { orderBy: { displayOrder: "asc" } },
          trades: { orderBy: { displayOrder: "asc" } },
        },
      });
    });
    await audit(req, {
      action: "UPDATE",
      entity: "Project",
      entityId: project.id,
      oldValue,
      newValue: project,
    });
    res.json(project);
  }),
);
app.delete(
  "/api/projects/:id",
  requirePermission("projects.write"),
  asyncRoute(async (req: any, res: any) => {
    const oldValue = await db.project.findFirstOrThrow({
      where: { id: req.params.id, deletedAt: null },
    });
    const project = await db.project.update({
      where: { id: oldValue.id },
      data: { deletedAt: new Date(), status: "CLOSED" },
    });
    await audit(req, {
      action: "PROJECT_DELETED",
      entity: "Project",
      entityId: project.id,
      oldValue,
      newValue: project,
    });
    res.status(204).send();
  }),
);
app.get(
  "/api/settings",
  requirePermission("settings.manage"),
  asyncRoute(async (_req: any, res: any) =>
    res.json(await db.applicationSetting.findMany({ orderBy: { key: "asc" } })),
  ),
);
app.get(
  "/api/users",
  requirePermission("users.manage"),
  asyncRoute(async (_req: any, res: any) =>
    res.json(
      await db.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          active: true,
          createdAt: true,
          role: { select: { key: true, name: true } },
        },
        orderBy: { name: "asc" },
      }),
    ),
  ),
);
app.get(
  "/api/audit-logs",
  requirePermission("audit.read"),
  asyncRoute(async (req: any, res: any) =>
    res.json(
      await db.auditLog.findMany({
        where: {
          entity:
            typeof req.query.entity === "string" ? req.query.entity : undefined,
          entityId:
            typeof req.query.entityId === "string"
              ? req.query.entityId
              : undefined,
        },
        take: 100,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true, email: true } } },
      }),
    ),
  ),
);

app.use((req, res) =>
  res
    .status(404)
    .json({ error: { code: "NOT_FOUND", message: "Resource not found." } }),
);
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  if (err instanceof z.ZodError)
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Please correct the highlighted information.",
        details: err.issues,
      },
    });
  if (err?.code === "P2002")
    return res.status(409).json({
      error: {
        code: "CONFLICT",
        message:
          "A category or cost code with this code already exists in the project.",
      },
    });
  res.status(err?.status || 500).json({
    error: {
      code: err?.status ? "INVALID_REQUEST" : "INTERNAL_ERROR",
      message: err?.status ? err.message : "An unexpected error occurred.",
    },
  });
});
app.listen(config.PORT, () =>
  console.log(
    JSON.stringify({
      level: "info",
      message: "COSTRA API started",
      port: config.PORT,
    }),
  ),
);
