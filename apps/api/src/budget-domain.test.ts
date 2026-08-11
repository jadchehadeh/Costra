import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  assertUniqueCode,
  availableToReallocate,
  createAuditChange,
  createBudgetAmount,
  currentApproved,
  quantityRateAmount,
  remainingBudget,
  sumMoney,
  validateReallocation,
} from "./budget-domain.js";
describe("budget and cost structure", () => {
  it("creates a budget item", () =>
    expect(createBudgetAmount({ originalBudget: "266000" }).toFixed(2)).toBe(
      "266000.00",
    ));
  it("calculates project budget total", () =>
    expect(sumMoney(["266000.10", "350000.20", "800000.30"]).toFixed(2)).toBe(
      "1416000.60",
    ));
  it("calculates category budget total", () =>
    expect(sumMoney(["10.01", "20.02"]).toFixed(2)).toBe("30.03"));
  it("calculates quantity times unit rate", () =>
    expect(quantityRateAmount("3", "0.10").toFixed(2)).toBe("0.30"));
  it("keeps current budget distinct from original", () =>
    expect(currentApproved("1000", [{ amount: "250" }]).toFixed(2)).toBe(
      "1250.00",
    ));
  it("applies positive and negative budget revisions", () =>
    expect(
      currentApproved("1000", [{ amount: "250" }, { amount: "-75" }]).toFixed(
        2,
      ),
    ).toBe("1175.00"));
  it("prevents duplicate cost codes", () =>
    expect(() => assertUniqueCode(["MAT-001"], "mat-001")).toThrow(
      "Duplicate",
    ));
  it("rejects invalid financial values", () => {
    expect(() => createBudgetAmount({})).toThrow();
    expect(() => new Prisma.Decimal("invalid")).toThrow();
  });
  it("creates audit log change data", () =>
    expect(
      createAuditChange(
        "item-1",
        new Prisma.Decimal(100),
        new Prisma.Decimal(20),
        "Approved correction",
      ),
    ).toEqual({
      action: "CURRENT_BUDGET_CHANGED",
      entity: "BudgetItem",
      entityId: "item-1",
      oldValue: { currentApprovedBudget: "100.00" },
      newValue: {
        currentApprovedBudget: "120.00",
        reason: "Approved correction",
      },
    }));
});
describe("budget reallocation", () => {
  it("calculates closed-item availability from authoritative cost to date", () =>
    expect(
      availableToReallocate({
        status: "CLOSED",
        currentBudget: "266000",
        costToDate: "240000",
      })?.toFixed(2),
    ).toBe("26000.00"));
  it("calculates negative remaining budget without hiding it", () =>
    expect(remainingBudget("100000", "115000")?.toFixed(2)).toBe("-15000.00"));
  it("returns unavailable while cost to date is unknown", () =>
    expect(
      availableToReallocate({
        status: "CLOSED",
        currentBudget: "266000",
        costToDate: null,
      }),
    ).toBeNull());
  it("validates partial transfers and rejects over-transfer", () => {
    const available = new Prisma.Decimal(26000);
    expect(
      validateReallocation({
        sourceId: "a",
        targetId: "b",
        sourceStatus: "CLOSED",
        available,
        amount: 15000,
      }).toFixed(2),
    ).toBe("15000.00");
    expect(() =>
      validateReallocation({
        sourceId: "a",
        targetId: "b",
        sourceStatus: "CLOSED",
        available: new Prisma.Decimal(1000),
        amount: 1001,
      }),
    ).toThrow("exceeds");
  });
  it("keeps a balanced project total", () => {
    const source = currentApproved("266000", [{ amount: "-15000" }]);
    const target = currentApproved("100000", [{ amount: "15000" }]);
    expect(source.add(target).toFixed(2)).toBe("366000.00");
  });
});
