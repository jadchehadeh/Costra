import {
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  Search,
  Upload,
  X,
} from "lucide-react";
import { api } from "./api";
type Category = {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  displayOrder: number;
};
type Dimension = {
  id: string;
  name: string;
  active: boolean;
  displayOrder: number;
};
type Item = {
  id: string;
  categoryId: string;
  tradeId?: string;
  packageId?: string;
  description: string;
  originalBudget: string;
  currentApprovedBudget: string;
  approvedChange: string;
  currency: string;
  notes?: string;
  active: boolean;
  status: "ACTIVE" | "CLOSED" | "ON_HOLD" | "CANCELLED";
  costToDate: string | null;
  remainingBudget: string | null;
  costCode: { code: string };
  category: { name: string };
  trade?: Dimension;
  package?: Dimension;
};
type Data = {
  summary: {
    totalBudget: string;
    costToDate: null;
    remainingBudget: null;
    originalBudget: string;
    currentApprovedBudget: string;
    approvedChanges: string;
    categoryCount: number;
    itemCount: number;
    currency: string;
  };
  categories: Category[];
  packages: Dimension[];
  trades: Dimension[];
  categorySummary: Array<{
    id: string;
    name: string;
    itemCount: number;
    currentApprovedBudget: string;
    costToDate: null;
    remainingBudget: null;
  }>;
  items: Item[];
};
type ReallocationData = {
  availableToReallocate: string | null;
  calculationStatus: string;
  calculationNote: string;
  eligible: Array<{
    id: string;
    description: string;
    category: string;
    budget: string;
    costToDate: string;
    remainingBudget: string;
    availableToReallocate: string;
    status: string;
    currency: string;
  }>;
  targets: Array<{
    id: string;
    description: string;
    category: string;
    budget: string;
    status: string;
    currency: string;
  }>;
  history: Array<{
    id: string;
    amount: string;
    reason: string;
    reference: string;
    createdAt: string;
    sourceBudgetItem: { description: string };
    targetBudgetItem: { description: string };
    createdBy: { name: string };
  }>;
};
export default function BudgetSimple({
  projectId,
  canWrite,
}: {
  projectId: string;
  canWrite: boolean;
}) {
  const [data, setData] = useState<Data>();
  const [reallocation, setReallocation] = useState<ReallocationData>();
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [tradeFilter, setTradeFilter] = useState("ALL");
  const [packageFilter, setPackageFilter] = useState("ALL");
  const [status, setStatus] = useState("ACTIVE");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [structure, setStructure] = useState(false);
  const [itemCategory, setItemCategory] = useState<string>();
  const [editItem, setEditItem] = useState<Item>();
  const [deletingItem, setDeletingItem] = useState<Item>();
  const [adjust, setAdjust] = useState<Item>();
  const [importOpen, setImportOpen] = useState(false);
  const [reallocationOpen, setReallocationOpen] = useState(false);
  const load = () =>
    Promise.all([
      api<Data>(`/projects/${projectId}/budget`),
      api<ReallocationData>(`/projects/${projectId}/budget-reallocations`),
    ])
      .then(([result, reallocationResult]) => {
        setData(result);
        setReallocation(reallocationResult);
        setExpanded((old) =>
          old.size
            ? old
            : new Set(
                result.categories.filter((c) => c.active).map((c) => c.id),
              ),
        );
      })
      .catch((e) => setError(e.message));
  async function deleteItem(item: Item) {
    await api(`/projects/${projectId}/budget-items/${item.id}`, {
      method: "DELETE",
    });
    setDeletingItem(undefined);
    await load();
  }
  useEffect(() => {
    void load();
  }, [projectId]);
  const visible = useMemo(
    () =>
      data?.items.filter(
        (i) =>
          (status === "ALL" || status === i.status) &&
          (filter === "ALL" || i.categoryId === filter) &&
          (tradeFilter === "ALL" || i.tradeId === tradeFilter) &&
          (packageFilter === "ALL" || i.packageId === packageFilter) &&
          `${i.description} ${i.category.name} ${i.costCode.code} ${i.trade?.name || ""} ${i.package?.name || ""}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ) || [],
    [data, search, filter, tradeFilter, packageFilter, status],
  );
  if (error) return <div className="error">{error}</div>;
  if (!data)
    return (
      <div className="center">
        <div className="spinner" />
      </div>
    );
  const activeCategories = data.categories.filter((c) => c.active);
  const categories = activeCategories.filter((category) => {
    return (
      visible.some(
        (item) =>
          item.categoryId === category.id &&
          Number(item.currentApprovedBudget) !== 0,
      ) &&
      (filter === "ALL" || category.id === filter)
    );
  });
  return (
    <div className="simple-budget">
      <div className="budget-title">
        <div>
          <p className="eyebrow">Project budget</p>
          <h2>Budget</h2>
          <p className="muted">
            Build and maintain the approved project budget.
          </p>
        </div>
        {canWrite && (
          <div className="actions">
            <button className="secondary" onClick={() => setImportOpen(true)}>
              <Upload /> Import
            </button>
            <button className="secondary" onClick={() => setStructure(true)}>
              Manage Structure
            </button>
            <button
              onClick={() =>
                activeCategories.length
                  ? setItemCategory(activeCategories[0].id)
                  : setStructure(true)
              }
            >
              <Plus /> Add Budget Item
            </button>
          </div>
        )}
      </div>
      <div className="budget-kpis">
        <Kpi
          label="Total Budget"
          value={cash(data.summary.totalBudget, data.summary.currency)}
        />
        <Kpi label="Cost to Date" value={"\u2014"} />
        <Kpi label="Remaining Budget" value={"\u2014"} />
        <Kpi
          label="Available to Reallocate"
          value={
            reallocation?.availableToReallocate
              ? cash(reallocation.availableToReallocate, data.summary.currency)
              : "\u2014"
          }
          action={
            canWrite ? (
              <button
                className="kpi-link"
                onClick={() => setReallocationOpen(true)}
              >
                View &amp; Reallocate
              </button>
            ) : undefined
          }
        />
        <Kpi label="Over Budget" value={"\u2014"} />
      </div>
      <div className="simple-tools">
        <label className="search">
          <Search />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search budget…"
          />
        </label>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="ALL">All categories</option>
          {data.categories
            .filter((c) => c.active)
            .map((c) => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
        </select>
        <select
          aria-label="Filter by trade"
          value={tradeFilter}
          onChange={(e) => setTradeFilter(e.target.value)}
        >
          <option value="ALL">All trades</option>
          {data.trades
            .filter((row) => row.active)
            .map((row) => (
              <option value={row.id} key={row.id}>
                {row.name}
              </option>
            ))}
        </select>
        <select
          aria-label="Filter by package"
          value={packageFilter}
          onChange={(e) => setPackageFilter(e.target.value)}
        >
          <option value="ALL">All packages</option>
          {data.packages
            .filter((row) => row.active)
            .map((row) => (
              <option value={row.id} key={row.id}>
                {row.name}
              </option>
            ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="ACTIVE">Active items</option>
          <option value="CLOSED">Closed items</option>
          <option value="ON_HOLD">On Hold items</option>
          <option value="CANCELLED">Cancelled items</option>
          <option value="ALL">All items</option>
        </select>
      </div>
      {categories.length === 0 ? (
        <div className="empty category-empty">
          <h3>
            {activeCategories.length
              ? "No budget values match this view."
              : "No budget structure yet."}
          </h3>
          {canWrite && (
            <button
              onClick={() =>
                activeCategories.length
                  ? setItemCategory(activeCategories[0].id)
                  : setStructure(true)
              }
            >
              <Plus />
              {activeCategories.length ? "Add Budget Item" : "Add Category"}
            </button>
          )}
        </div>
      ) : (
        <div className="category-list">
          {categories.map((category) => {
            const rows = visible.filter((i) => i.categoryId === category.id);
            const filteredBudget = rows.reduce(
              (total, item) => total + Number(item.currentApprovedBudget),
              0,
            );
            const open = expanded.has(category.id);
            return (
              <section className="category-section" key={category.id}>
                <button
                  className="category-head"
                  onClick={() =>
                    setExpanded((current) => {
                      const next = new Set(current);
                      next.has(category.id)
                        ? next.delete(category.id)
                        : next.add(category.id);
                      return next;
                    })
                  }
                >
                  {open ? <ChevronDown /> : <ChevronRight />}
                  <span className="category-name">
                    <b>{category.name}</b>
                    <small>
                      {rows.length} item{rows.length === 1 ? "" : "s"}
                    </small>
                  </span>
                  <strong>
                    Budget {cash(filteredBudget, data.summary.currency)}
                  </strong>
                </button>
                {open && (
                  <div className="category-body">
                    {rows.length ? (
                      <>
                        <div className="simple-table-head">
                          <span>Description</span>
                          <span>Trade / Package</span>
                          <span>Budget</span>
                          <span>Cost to Date</span>
                          <span>Remaining</span>
                          <span>Status</span>
                          <span />
                        </div>
                        {rows.map((item) => (
                          <div className="simple-row" key={item.id}>
                            <span>
                              <b>{item.description}</b>
                              <small>{item.costCode.code}</small>
                            </span>
                            <span className="item-dimensions">
                              <b>{item.trade?.name || "—"}</b>
                              <small>{item.package?.name || "—"}</small>
                            </span>
                            <span>
                              <b>{amount(item.currentApprovedBudget)}</b>
                            </span>
                            <span>
                              {item.costToDate === null
                                ? "\u2014"
                                : amount(item.costToDate)}
                            </span>
                            <span>
                              {item.remainingBudget === null
                                ? "\u2014"
                                : amount(item.remainingBudget)}
                            </span>
                            <span>
                              <ItemStatus value={item.status} />
                            </span>
                            <span>
                              {canWrite && (
                                <div className="row-actions">
                                  <button
                                    className="table-action"
                                    onClick={() => setEditItem(item)}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    className="table-action"
                                    onClick={() => setAdjust(item)}
                                  >
                                    Adjust Budget
                                  </button>
                                  <button
                                    className="danger-link"
                                    onClick={() => setDeletingItem(item)}
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </span>
                          </div>
                        ))}
                        <div className="category-total">
                          <span>
                            <b>{category.name} Total</b>
                          </span>
                          <span>
                            Budget{" "}
                            <b>{cash(filteredBudget, data.summary.currency)}</b>
                          </span>
                          <span>
                            Cost to Date <b>{"\u2014"}</b>
                          </span>
                          <span>
                            Remaining <b>{"\u2014"}</b>
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="empty inline-empty">
                        <p>{category.name} has no budget items yet.</p>
                        {canWrite && (
                          <button onClick={() => setItemCategory(category.id)}>
                            <Plus /> Add Budget Item
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
      <div className="budget-total">
        <span>
          {filter !== "ALL" || tradeFilter !== "ALL" || packageFilter !== "ALL"
            ? "Filtered Budget Total"
            : "Total Project Budget"}
        </span>
        <strong>
          {cash(
            visible.reduce(
              (total, item) => total + Number(item.currentApprovedBudget),
              0,
            ),
            data.summary.currency,
          )}
        </strong>
      </div>
      {structure && (
        <StructureManager
          projectId={projectId}
          categories={data.categories}
          onClose={() => setStructure(false)}
          onChanged={load}
        />
      )}{" "}
      {itemCategory && (
        <ItemModal
          projectId={projectId}
          categories={data.categories}
          trades={data.trades}
          packages={data.packages}
          initial={itemCategory}
          onClose={() => setItemCategory(undefined)}
          onSaved={() => {
            setItemCategory(undefined);
            load();
          }}
        />
      )}
      {adjust && (
        <AdjustModal
          projectId={projectId}
          item={adjust}
          onClose={() => setAdjust(undefined)}
          onSaved={() => {
            setAdjust(undefined);
            load();
          }}
        />
      )}
      {editItem && (
        <EditItemModal
          projectId={projectId}
          item={editItem}
          categories={data.categories}
          trades={data.trades}
          packages={data.packages}
          onClose={() => setEditItem(undefined)}
          onSaved={() => {
            setEditItem(undefined);
            load();
          }}
        />
      )}
      {deletingItem && (
        <DeleteItemDialog
          item={deletingItem}
          onClose={() => setDeletingItem(undefined)}
          onConfirm={() => deleteItem(deletingItem)}
        />
      )}
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
      {reallocationOpen && reallocation && (
        <ReallocationModal
          projectId={projectId}
          data={reallocation}
          categories={activeCategories}
          onClose={() => setReallocationOpen(false)}
          onSaved={() => {
            setReallocationOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}
function StructureManager({
  projectId,
  categories,
  onClose,
  onChanged,
}: {
  projectId: string;
  categories: Category[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState(categories);
  const [editing, setEditing] = useState<Category | true>();
  const [dragged, setDragged] = useState<string>();
  const [error, setError] = useState("");
  async function drop(target: string) {
    if (!dragged || dragged === target) return;
    const next = [...rows];
    const from = next.findIndex((x) => x.id === dragged),
      to = next.findIndex((x) => x.id === target);
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    setRows(next);
    setDragged(undefined);
    try {
      await api(`/projects/${projectId}/category-order`, {
        method: "PUT",
        body: JSON.stringify({ categoryIds: next.map((x) => x.id) }),
      });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const current = editing === true ? undefined : editing;
    try {
      await api(
        current
          ? `/projects/${projectId}/categories/${current.id}`
          : `/projects/${projectId}/categories`,
        {
          method: current ? "PUT" : "POST",
          body: JSON.stringify({
            name: f.get("name"),
            description: f.get("description") || null,
            active: current?.active ?? true,
          }),
        },
      );
      setEditing(undefined);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function deactivate(row: Category) {
    if (
      !confirm(
        `Deactivate ${row.name}? Existing budget items will be retained.`,
      )
    )
      return;
    await api(`/projects/${projectId}/categories/${row.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: row.name,
        description: row.description || null,
        active: false,
      }),
    });
    setRows((current) =>
      current.map((x) => (x.id === row.id ? { ...x, active: false } : x)),
    );
    onChanged();
  }
  return (
    <div className="modal-bg">
      <div className="modal structure-modal">
        <header>
          <div>
            <p className="eyebrow">Project budget</p>
            <h2>Manage Budget Structure</h2>
            <p className="muted">Drag categories to change their order.</p>
          </div>
          <button className="icon" onClick={onClose}>
            <X />
          </button>
        </header>
        {error && <div className="error">{error}</div>}
        <div className="structure-list">
          {rows.map((row) => (
            <div
              className={`structure-row ${!row.active ? "inactive" : ""}`}
              draggable={row.active}
              onDragStart={() => setDragged(row.id)}
              onDragOver={(e: DragEvent) => e.preventDefault()}
              onDrop={() => void drop(row.id)}
              key={row.id}
            >
              <GripVertical />
              <span>
                <b>{row.name}</b>
                {row.description && <small>{row.description}</small>}
              </span>
              <button className="table-action" onClick={() => setEditing(row)}>
                Edit
              </button>
              {row.active && (
                <button
                  className="danger-link"
                  onClick={() => void deactivate(row)}
                >
                  Deactivate
                </button>
              )}
            </div>
          ))}
        </div>
        {editing ? (
          <form className="structure-form" onSubmit={save}>
            <label>
              Category Name
              <input
                name="name"
                required
                autoFocus
                defaultValue={editing === true ? "" : editing.name}
              />
            </label>
            <label>
              Description (optional)
              <textarea
                name="description"
                defaultValue={editing === true ? "" : editing.description}
              />
            </label>
            <div>
              <button
                type="button"
                className="secondary"
                onClick={() => setEditing(undefined)}
              >
                Cancel
              </button>
              <button>
                {editing === true ? "Create Category" : "Save Changes"}
              </button>
            </div>
          </form>
        ) : (
          <button onClick={() => setEditing(true)}>
            <Plus /> Add Category
          </button>
        )}
        <footer>
          <button className="secondary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
function DeleteItemDialog({
  item,
  onClose,
  onConfirm,
}: {
  item: Item;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div
      className="modal-bg"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-item-title"
    >
      <div className="modal delete-dialog">
        <header>
          <div className="delete-icon">
            <AlertTriangle />
          </div>
          <button className="icon" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </header>
        <h2 id="delete-item-title">Delete budget item?</h2>
        <p>
          This will remove <b>{item.description}</b> from the operational
          budget.
        </p>
        <div className="delete-record">
          <span>
            <small>Current Budget</small>
            <b>{cash(item.currentApprovedBudget, item.currency)}</b>
          </span>
          <span>
            <small>Status</small>
            <b>{item.status.replace("_", " ")}</b>
          </span>
        </div>
        <div className="delete-warning">
          <b>This action affects project totals.</b>
          <span>
            The item will be excluded from category and project totals. Its
            original budget, adjustments, reallocations, and audit history will
            be retained.
          </span>
        </div>
        {error && <div className="error">{error}</div>}
        <label>
          Type <b>DELETE</b> to confirm
          <input
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value.toUpperCase())}
            autoFocus
            autoComplete="off"
            placeholder="DELETE"
          />
        </label>
        <footer>
          <button className="secondary" onClick={onClose} disabled={busy}>
            Keep Budget Item
          </button>
          <button
            className="danger-confirm"
            disabled={confirmation !== "DELETE" || busy}
            onClick={() => void remove()}
          >
            {busy ? "Deleting…" : "Delete Budget Item"}
          </button>
        </footer>
      </div>
    </div>
  );
}
function ItemModal({
  projectId,
  categories,
  trades,
  packages,
  initial,
  onClose,
  onSaved,
}: {
  projectId: string;
  categories: Category[];
  trades: Dimension[];
  packages: Dimension[];
  initial: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  const [categoryId, setCategoryId] = useState(initial);
  const materialName = categories.find(
    (category) => category.id === categoryId,
  )?.name;
  const isMaterial = materialName
    ? ["material", "materials"].includes(
        materialName.trim().toLowerCase().replace(/[^a-z]/g, ""),
      )
    : false;
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await api(`/projects/${projectId}/budget-items/simple`, {
        method: "POST",
        body: JSON.stringify({
          categoryId: f.get("categoryId"),
          tradeId: f.get("tradeId") || null,
          packageId: f.get("packageId") || null,
          description: f.get("description"),
          budget: f.get("budget"),
          currency: f.get("currency"),
          notes: f.get("notes") || null,
          status: f.get("status"),
        }),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="modal-bg">
      <form className="modal small" onSubmit={save}>
        <header>
          <div>
            <p className="eyebrow">Project budget</p>
            <h2>Add Budget Item</h2>
          </div>
          <button type="button" className="icon" onClick={onClose}>
            <X />
          </button>
        </header>
        {error && <div className="error">{error}</div>}
        <div className="form-grid one">
          <label>
            Category
            <select
              name="categoryId"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              {categories
                .filter((c) => c.active)
                .map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          {isMaterial && (
            <>
              <label>
                Trade
                <select name="tradeId" required defaultValue="">
                  <option value="" disabled>
                    Select trade
                  </option>
                  {trades
                    .filter((row) => row.active)
                    .map((row) => (
                      <option value={row.id} key={row.id}>
                        {row.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Package
                <select name="packageId" required defaultValue="">
                  <option value="" disabled>
                    Select package
                  </option>
                  {packages
                    .filter((row) => row.active)
                    .map((row) => (
                      <option value={row.id} key={row.id}>
                        {row.name}
                      </option>
                    ))}
                </select>
                {!packages.some((row) => row.active) && (
                  <small>
                    Add a package in Edit Project before creating Materials.
                  </small>
                )}
              </label>
            </>
          )}
          <label>
            Description
            <input
              name="description"
              required
              autoFocus
              placeholder="e.g. UPVC Pipes & Fittings"
            />
          </label>
          <label>
            Budget
            <input
              name="budget"
              type="number"
              min="0"
              step="0.01"
              required
              placeholder="0.00"
            />
          </label>
          <label>
            Currency
            <select name="currency" defaultValue="SAR">
              <option>SAR</option>
              <option>USD</option>
              <option>AED</option>
              <option>EUR</option>
            </select>
          </label>
          <label>
            Status
            <select name="status" defaultValue="ACTIVE">
              <option value="ACTIVE">Active</option>
              <option value="ON_HOLD">On Hold</option>
              <option value="CLOSED">Closed</option>
            </select>
          </label>
          <label>
            Notes (optional)
            <textarea name="notes" />
          </label>
        </div>
        <footer>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button>Save Budget Item</button>
        </footer>
      </form>
    </div>
  );
}
function AdjustModal({
  projectId,
  item,
  onClose,
  onSaved,
}: {
  projectId: string;
  item: Item;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await api(`/projects/${projectId}/budget-items/${item.id}/adjust`, {
        method: "POST",
        body: JSON.stringify({
          newApprovedBudget: f.get("newApprovedBudget"),
          reason: f.get("reason"),
        }),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="modal-bg">
      <form className="modal small" onSubmit={save}>
        <header>
          <div>
            <p className="eyebrow">Controlled change</p>
            <h2>Adjust Budget</h2>
            <p className="muted">{item.description}</p>
          </div>
          <button type="button" className="icon" onClick={onClose}>
            <X />
          </button>
        </header>
        {error && <div className="error">{error}</div>}
        <div className="approved-context">
          <span>
            <small>Original Budget</small>
            <b>{cash(item.originalBudget, item.currency)}</b>
          </span>
          <span>
            <small>Current Approved Budget</small>
            <b>{cash(item.currentApprovedBudget, item.currency)}</b>
          </span>
        </div>
        <div className="form-grid one">
          <label>
            New Approved Budget
            <input
              name="newApprovedBudget"
              type="number"
              min="0"
              step="0.01"
              required
              defaultValue={item.currentApprovedBudget}
            />
          </label>
          <label>
            Reason
            <textarea name="reason" required minLength={5} />
          </label>
        </div>
        <div className="notice compact-notice">
          Original Budget remains unchanged. COSTRA calculates and audits the
          approved change.
        </div>
        <footer>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button>Save Adjustment</button>
        </footer>
      </form>
    </div>
  );
}
function EditItemModal({
  projectId,
  item,
  categories,
  trades,
  packages,
  onClose,
  onSaved,
}: {
  projectId: string;
  item: Item;
  categories: Category[];
  trades: Dimension[];
  packages: Dimension[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  const [categoryId, setCategoryId] = useState(item.categoryId);
  const materialName = categories.find(
    (category) => category.id === categoryId,
  )?.name;
  const isMaterial = materialName
    ? ["material", "materials"].includes(
        materialName.trim().toLowerCase().replace(/[^a-z]/g, ""),
      )
    : false;
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await api(`/projects/${projectId}/budget-items/${item.id}/simple`, {
        method: "PUT",
        body: JSON.stringify({
          categoryId: f.get("categoryId"),
          tradeId: f.get("tradeId") || null,
          packageId: f.get("packageId") || null,
          description: f.get("description"),
          notes: f.get("notes") || null,
          status: f.get("status"),
        }),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="modal-bg">
      <form className="modal small" onSubmit={save}>
        <header>
          <div>
            <p className="eyebrow">Budget item</p>
            <h2>Edit Item</h2>
          </div>
          <button type="button" className="icon" onClick={onClose}>
            <X />
          </button>
        </header>
        {error && <div className="error">{error}</div>}
        <div className="form-grid one">
          <label>
            Category
            <select
              name="categoryId"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              {categories
                .filter((row) => row.active)
                .map((row) => (
                  <option value={row.id} key={row.id}>
                    {row.name}
                  </option>
                ))}
            </select>
          </label>
          {isMaterial && (
            <>
              <label>
                Trade
                <select
                  name="tradeId"
                  required
                  defaultValue={item.tradeId || ""}
                >
                  <option value="" disabled>
                    Select trade
                  </option>
                  {trades
                    .filter((row) => row.active)
                    .map((row) => (
                      <option value={row.id} key={row.id}>
                        {row.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Package
                <select
                  name="packageId"
                  required
                  defaultValue={item.packageId || ""}
                >
                  <option value="" disabled>
                    Select package
                  </option>
                  {packages
                    .filter((row) => row.active)
                    .map((row) => (
                      <option value={row.id} key={row.id}>
                        {row.name}
                      </option>
                    ))}
                </select>
              </label>
            </>
          )}
          <label>
            Description
            <input
              name="description"
              required
              autoFocus
              defaultValue={item.description}
            />
          </label>
          <label>
            Notes (optional)
            <textarea name="notes" defaultValue={item.notes} />
          </label>
          <label>
            Status
            <select name="status" defaultValue={item.status}>
              <option value="ACTIVE">Active</option>
              <option value="CLOSED">Closed</option>
              <option value="ON_HOLD">On Hold</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </label>
        </div>
        <div className="notice compact-notice">
          Original and current approved budgets are protected here. Use Adjust
          Budget for approved financial changes.
        </div>
        <footer>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button>Save Changes</button>
        </footer>
      </form>
    </div>
  );
}
function ImportModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-bg">
      <div className="modal small">
        <header>
          <h2>Import Project Budget</h2>
          <button className="icon" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="import-steps">
          <span className="active">1 Upload</span>
          <span>2 Preview</span>
          <span>3 Map</span>
          <span>4 Validate</span>
          <span>5 Import</span>
        </div>
        <div className="empty import">
          <Upload />
          <h3>Excel import is being prepared</h3>
          <p>No data will be imported without preview and validation.</p>
        </div>
        <footer>
          <button className="secondary" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
function ReallocationModal({
  projectId,
  data,
  categories,
  onClose,
  onSaved,
}: {
  projectId: string;
  data: ReallocationData;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [sourceId, setSourceId] = useState(data.eligible[0]?.id || "");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [error, setError] = useState("");
  const source = data.eligible.find((item) => item.id === sourceId);
  async function transfer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await api(`/projects/${projectId}/budget-reallocations`, {
        method: "POST",
        body: JSON.stringify({
          sourceBudgetItemId: sourceId,
          targetBudgetItemId:
            mode === "existing" ? f.get("targetBudgetItemId") : undefined,
          newTarget:
            mode === "new"
              ? {
                  categoryId: f.get("categoryId"),
                  description: f.get("description"),
                  currency: source?.currency || "SAR",
                }
              : undefined,
          amount: f.get("amount"),
          reason: f.get("reason"),
        }),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="modal-bg">
      <div className="modal reallocation-modal">
        <header>
          <div>
            <p className="eyebrow">Controlled financial transaction</p>
            <h2>Available Budget for Reallocation</h2>
          </div>
          <button className="icon" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="reallocation-summary">
          <small>Available to Reallocate</small>
          <strong>
            {data.availableToReallocate
              ? cash(data.availableToReallocate, source?.currency || "SAR")
              : "\u2014"}
          </strong>
        </div>
        {error && <div className="error">{error}</div>}
        {data.eligible.length === 0 ? (
          <div className="empty reallocation-empty">
            <h3>No budget is currently eligible for reallocation.</h3>
            <p>{data.calculationNote}</p>
            <div className="notice compact-notice">
              COSTRA will not estimate Cost to Date or move money automatically.
            </div>
          </div>
        ) : (
          <form onSubmit={transfer}>
            <div className="reallocation-table">
              <div className="reallocation-head">
                <span>Budget Item</span>
                <span>Category</span>
                <span>Budget</span>
                <span>Cost to Date</span>
                <span>Remaining</span>
                <span>Available</span>
              </div>
              {data.eligible.map((item) => (
                <label className="reallocation-row" key={item.id}>
                  <input
                    type="radio"
                    name="source"
                    checked={sourceId === item.id}
                    onChange={() => setSourceId(item.id)}
                  />
                  <span>
                    <b>{item.description}</b>
                  </span>
                  <span>{item.category}</span>
                  <span>{amount(item.budget)}</span>
                  <span>{amount(item.costToDate)}</span>
                  <span>{amount(item.remainingBudget)}</span>
                  <span>
                    <b>{amount(item.availableToReallocate)}</b>
                  </span>
                </label>
              ))}
            </div>
            <section className="transfer-form">
              <h3>Reallocate Budget</h3>
              <div className="source-panel">
                <small>From Budget Item</small>
                <b>{source?.description}</b>
                <span>
                  Available:{" "}
                  {source
                    ? cash(source.availableToReallocate, source.currency)
                    : "—"}
                </span>
              </div>
              <div className="tabs">
                <button
                  type="button"
                  className={mode === "existing" ? "active" : ""}
                  onClick={() => setMode("existing")}
                >
                  Existing Budget Item
                </button>
                <button
                  type="button"
                  className={mode === "new" ? "active" : ""}
                  onClick={() => setMode("new")}
                >
                  New Budget Item
                </button>
              </div>
              <div className="form-grid one">
                {mode === "existing" ? (
                  <label>
                    Target Budget Item
                    <select name="targetBudgetItemId" required>
                      <option value="">Select budget item</option>
                      {data.targets
                        .filter((item) => item.id !== sourceId)
                        .map((item) => (
                          <option value={item.id} key={item.id}>
                            {item.category} — {item.description}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : (
                  <>
                    <label>
                      Category
                      <select name="categoryId" required>
                        {categories.map((category) => (
                          <option value={category.id} key={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Description
                      <input name="description" required />
                    </label>
                  </>
                )}
                <label>
                  Amount
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    max={source?.availableToReallocate}
                    step="0.01"
                    required
                  />
                </label>
                <label>
                  Reason
                  <textarea name="reason" minLength={5} required />
                </label>
              </div>
              <footer>
                <button type="button" className="secondary" onClick={onClose}>
                  Cancel
                </button>
                <button>Transfer Budget</button>
              </footer>
            </section>
          </form>
        )}
        {data.history.length > 0 && (
          <section className="reallocation-history">
            <h3>Reallocation History</h3>
            {data.history.map((row) => (
              <article key={row.id}>
                <b>{cash(row.amount, "SAR")}</b>
                <span>
                  {row.sourceBudgetItem.description} →{" "}
                  {row.targetBudgetItem.description}
                </span>
                <small>
                  {row.reference} ·{" "}
                  {new Date(row.createdAt).toLocaleDateString()} ·{" "}
                  {row.createdBy.name}
                </small>
              </article>
            ))}
          </section>
        )}
        <footer>
          <button className="secondary" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
function Kpi({
  label,
  value,
  action,
}: {
  label: string;
  value: string;
  action?: ReactNode;
}) {
  return (
    <article>
      <small>{label}</small>
      <strong>{value}</strong>
      {action}
    </article>
  );
}
function ItemStatus({ value }: { value: Item["status"] }) {
  const labels = {
    ACTIVE: "Active",
    CLOSED: "Closed",
    ON_HOLD: "On Hold",
    CANCELLED: "Cancelled",
  };
  return (
    <span className={`status s-${value.toLowerCase()}`}>
      <i /> {labels[value]}
    </span>
  );
}
const amount = (v: string) =>
  Number(v).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const cash = (v: string | number, c: string) => `${c} ${amount(String(v))}`;
const signed = (v: string) => `${Number(v) > 0 ? "+" : ""}${amount(v)}`;
const signedCash = (v: string, c: string) =>
  `${Number(v) > 0 ? "+" : ""}${c} ${amount(v)}`;
