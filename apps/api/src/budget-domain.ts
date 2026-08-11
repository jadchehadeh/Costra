import { Prisma } from "@prisma/client";
export const money = (value: string | number | Prisma.Decimal) =>
  new Prisma.Decimal(value).toDecimalPlaces(2);
export function quantityRateAmount(
  quantity: string | number | Prisma.Decimal,
  unitRate: string | number | Prisma.Decimal,
) {
  return new Prisma.Decimal(quantity).mul(unitRate).toDecimalPlaces(2);
}
export function currentApproved(
  original: string | number | Prisma.Decimal,
  revisions: Array<{ amount: string | number | Prisma.Decimal }>,
) {
  return revisions
    .reduce((sum, r) => sum.add(r.amount), money(original))
    .toDecimalPlaces(2);
}
export function sumMoney(values: Array<string | number | Prisma.Decimal>) {
  return values
    .reduce<Prisma.Decimal>(
      (sum, value) => sum.add(value),
      new Prisma.Decimal(0),
    )
    .toDecimalPlaces(2);
}
export function createBudgetAmount(input: {
  originalBudget?: string | number;
  quantity?: string | number;
  unitRate?: string | number;
}) {
  if (input.originalBudget !== undefined) return money(input.originalBudget);
  if (input.quantity !== undefined && input.unitRate !== undefined)
    return quantityRateAmount(input.quantity, input.unitRate);
  throw new Error("An original amount or quantity and rate are required.");
}
export function assertUniqueCode(existing: string[], candidate: string) {
  if (
    existing.some(
      (value) => value.toUpperCase() === candidate.trim().toUpperCase(),
    )
  )
    throw new Error("Duplicate cost code.");
  return candidate.trim().toUpperCase();
}
export function createAuditChange(
  entityId: string,
  before: Prisma.Decimal,
  change: Prisma.Decimal,
  reason: string,
) {
  return {
    action: "CURRENT_BUDGET_CHANGED",
    entity: "BudgetItem",
    entityId,
    oldValue: { currentApprovedBudget: before.toFixed(2) },
    newValue: { currentApprovedBudget: before.add(change).toFixed(2), reason },
  };
}
export function remainingBudget(
  currentBudget: string | number | Prisma.Decimal,
  costToDate: string | number | Prisma.Decimal | null,
) {
  return costToDate === null
    ? null
    : money(currentBudget).sub(costToDate).toDecimalPlaces(2);
}
export function availableToReallocate(input: {
  status: string;
  currentBudget: string | number | Prisma.Decimal;
  costToDate: string | number | Prisma.Decimal | null;
  outstandingCommitments?: string | number | Prisma.Decimal | null;
  outstandingAccruals?: string | number | Prisma.Decimal | null;
}) {
  if (input.status !== "CLOSED" || input.costToDate === null) return null;
  const available = money(input.currentBudget)
    .sub(input.costToDate)
    .sub(input.outstandingCommitments ?? 0)
    .sub(input.outstandingAccruals ?? 0);
  return available.greaterThan(0)
    ? available.toDecimalPlaces(2)
    : new Prisma.Decimal(0);
}
export function validateReallocation(input: {
  sourceId: string;
  targetId: string;
  sourceStatus: string;
  available: Prisma.Decimal | null;
  amount: string | number | Prisma.Decimal;
}) {
  const invalid = (message: string) =>
    Object.assign(new Error(message), { status: 400 });
  const amount = money(input.amount);
  if (input.sourceId === input.targetId)
    throw invalid("Source and target must be different budget items.");
  if (input.sourceStatus !== "CLOSED")
    throw invalid("Only Closed budget items can fund a reallocation.");
  if (input.available === null)
    throw invalid("Cost to Date is not available for this source item.");
  if (amount.lessThanOrEqualTo(0))
    throw invalid("Transfer amount must be greater than zero.");
  if (amount.greaterThan(input.available))
    throw invalid("Transfer amount exceeds the available budget.");
  return amount;
}
