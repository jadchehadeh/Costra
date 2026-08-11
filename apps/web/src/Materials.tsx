import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, ChevronRight, Plus, Search, X } from "lucide-react";
import { api } from "./api";

type Dimension = { id: string; name: string; active: boolean };
type PoStatus =
  "OPEN" | "PARTIALLY_RECEIVED" | "FULLY_RECEIVED" | "CLOSED" | "CANCELLED";
type PurchaseOrder = {
  id: string;
  poNumber: string;
  poDate: string;
  poAmount: string;
  receivedMaterialValue: string;
  remainingMaterialAmount: string;
  accruals: string;
  paid: string;
  costToDate: string;
  notes?: string;
  status: PoStatus;
  supplier: Dimension;
};
type Material = {
  id: string;
  description: string;
  packageId: string;
  tradeId: string;
  package: Dimension;
  trade: Dimension;
  originalBudget: string;
  currentBudget: string;
  currency: string;
  status: "ACTIVE" | "CLOSED" | "ON_HOLD" | "CANCELLED";
  notes?: string;
  costCode: { code: string };
  createdAt: string;
  updatedAt: string;
  purchaseOrders: PurchaseOrder[];
  totalPoAmount: string;
  totalAccruals: string;
  totalPaid: string;
  costToDate: string;
  remainingBudget: string;
  availableToReallocate: string;
  overBudget: string;
};
type MaterialsData = {
  materials: Material[];
  packages: Dimension[];
  trades: Dimension[];
  suppliers: Dimension[];
  summary: {
    totalBudget: string;
    totalPoAmount: string;
    costToDate: string;
    remainingBudget: string;
    availableToReallocate: string;
    overBudget: string;
    currency: string;
  };
};
type SortKey =
  | "description"
  | "package"
  | "trade"
  | "budget"
  | "po"
  | "cost"
  | "remaining"
  | "status";

export default function Materials({
  projectId,
  canWrite,
  onOpenBudget,
}: {
  projectId: string;
  canWrite: boolean;
  onOpenBudget: () => void;
}) {
  const [data, setData] = useState<MaterialsData>();
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [packageId, setPackageId] = useState("ALL");
  const [tradeId, setTradeId] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [supplierId, setSupplierId] = useState("ALL");
  const [poStatus, setPoStatus] = useState("ALL");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [remaining, setRemaining] = useState("ALL");
  const [sort, setSort] = useState<SortKey>("description");
  const [selected, setSelected] = useState<Material>();
  const [edit, setEdit] = useState<Material | true>();
  const [poEdit, setPoEdit] = useState<PurchaseOrder | true>();
  const [historyPo, setHistoryPo] = useState<PurchaseOrder>();
  const [receivedPo, setReceivedPo] = useState<PurchaseOrder>();
  const [supplierManager, setSupplierManager] = useState(false);
  const load = () =>
    api<MaterialsData>(`/projects/${projectId}/materials`)
      .then((result) => {
        setData(result);
        setSelected((current) =>
          current
            ? result.materials.find((row) => row.id === current.id)
            : undefined,
        );
      })
      .catch((reason) => setError(reason.message));
  useEffect(() => void load(), [projectId]);
  const rows = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    const filtered = data.materials.filter((item) => {
      const poMatch = item.purchaseOrders.some(
        (po) =>
          po.poNumber.toLowerCase().includes(term) ||
          po.supplier.name.toLowerCase().includes(term),
      );
      const searchMatch =
        !term ||
        `${item.description} ${item.package.name} ${item.trade.name}`
          .toLowerCase()
          .includes(term) ||
        poMatch;
      const supplierMatch =
        supplierId === "ALL" ||
        item.purchaseOrders.some((po) => po.supplier.id === supplierId);
      const poStatusMatch =
        poStatus === "ALL" ||
        item.purchaseOrders.some((po) => po.status === poStatus);
      const budget = Number(item.currentBudget);
      const balance = Number(item.remainingBudget);
      return (
        searchMatch &&
        (packageId === "ALL" || item.packageId === packageId) &&
        (tradeId === "ALL" || item.tradeId === tradeId) &&
        (status === "ALL" || item.status === status) &&
        supplierMatch &&
        poStatusMatch &&
        (!budgetMin || budget >= Number(budgetMin)) &&
        (!budgetMax || budget <= Number(budgetMax)) &&
        (remaining === "ALL" ||
          (remaining === "POSITIVE" && balance > 0) ||
          (remaining === "ZERO" && balance === 0) ||
          (remaining === "NEGATIVE" && balance < 0))
      );
    });
    return filtered.sort((a, b) => {
      const values: Record<SortKey, [string | number, string | number]> = {
        description: [a.description, b.description],
        package: [a.package.name, b.package.name],
        trade: [a.trade.name, b.trade.name],
        budget: [Number(a.currentBudget), Number(b.currentBudget)],
        po: [Number(a.totalPoAmount), Number(b.totalPoAmount)],
        cost: [Number(a.costToDate), Number(b.costToDate)],
        remaining: [Number(a.remainingBudget), Number(b.remainingBudget)],
        status: [a.status, b.status],
      };
      return String(values[sort][0]).localeCompare(
        String(values[sort][1]),
        undefined,
        { numeric: true },
      );
    });
  }, [
    data,
    search,
    packageId,
    tradeId,
    status,
    supplierId,
    poStatus,
    budgetMin,
    budgetMax,
    remaining,
    sort,
  ]);
  if (error) return <div className="error">{error}</div>;
  if (!data)
    return (
      <div className="center">
        <div className="spinner" />
      </div>
    );
  const hasPoData = data.materials.some((item) => item.purchaseOrders.length);
  return (
    <div className="materials-module">
      <div className="budget-title">
        <div>
          <p className="eyebrow">Project cost control</p>
          <h2>Materials</h2>
          <p className="muted">
            Material budgets and purchase-order financial control.
          </p>
        </div>
        {canWrite && (
          <div className="actions">
            <button
              className="secondary"
              onClick={() => setSupplierManager(true)}
            >
              Register Suppliers
            </button>
            <button onClick={() => setEdit(true)}>
              <Plus /> Add Material
            </button>
          </div>
        )}
      </div>
      <div className="material-kpis">
        <Metric
          label="Total Budget"
          value={cash(data.summary.totalBudget, data.summary.currency)}
        />
        <Metric
          label="Total PO Amount"
          value={cash(data.summary.totalPoAmount, data.summary.currency)}
        />
        <Metric
          label="Cost to Date"
          value={
            hasPoData
              ? cash(data.summary.costToDate, data.summary.currency)
              : "—"
          }
        />
        <Metric
          label="Remaining Budget"
          value={cash(data.summary.remainingBudget, data.summary.currency)}
        />
        <Metric
          label="Available to Reallocate"
          value={cash(
            data.summary.availableToReallocate,
            data.summary.currency,
          )}
          tone="good"
        />
        <Metric
          label="Over Budget"
          value={cash(data.summary.overBudget, data.summary.currency)}
          tone={Number(data.summary.overBudget) > 0 ? "danger" : undefined}
        />
      </div>
      <div className="material-filters">
        <label className="search">
          <Search />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search material, PO or supplier"
          />
        </label>
        <Filter
          value={packageId}
          onChange={setPackageId}
          label="All packages"
          rows={data.packages}
        />
        <Filter
          value={tradeId}
          onChange={setTradeId}
          label="All trades"
          rows={data.trades}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="CLOSED">Closed</option>
          <option value="ON_HOLD">On Hold</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <Filter
          value={supplierId}
          onChange={setSupplierId}
          label="All suppliers"
          rows={data.suppliers}
        />
        <select value={poStatus} onChange={(e) => setPoStatus(e.target.value)}>
          <option value="ALL">All PO statuses</option>
          <option value="OPEN">Open PO</option>
          <option value="PARTIALLY_RECEIVED">Partially Received</option>
          <option value="FULLY_RECEIVED">Fully Received</option>
          <option value="CLOSED">Closed PO</option>
          <option value="CANCELLED">Cancelled PO</option>
        </select>
        <input
          aria-label="Minimum budget"
          type="number"
          min="0"
          placeholder="Min budget"
          value={budgetMin}
          onChange={(e) => setBudgetMin(e.target.value)}
        />
        <input
          aria-label="Maximum budget"
          type="number"
          min="0"
          placeholder="Max budget"
          value={budgetMax}
          onChange={(e) => setBudgetMax(e.target.value)}
        />
        <select
          value={remaining}
          onChange={(e) => setRemaining(e.target.value)}
        >
          <option value="ALL">Any remaining budget</option>
          <option value="POSITIVE">Positive remaining</option>
          <option value="ZERO">Zero remaining</option>
          <option value="NEGATIVE">Over budget</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
        >
          <option value="description">Sort: Material</option>
          <option value="package">Sort: Package</option>
          <option value="trade">Sort: Trade</option>
          <option value="budget">Sort: Budget</option>
          <option value="po">Sort: Total PO</option>
          <option value="cost">Sort: Cost to Date</option>
          <option value="remaining">Sort: Remaining</option>
          <option value="status">Sort: Status</option>
        </select>
      </div>
      <div className="materials-table-wrap">
        <div className="materials-head">
          <span>#</span>
          <span>Material</span>
          <span>Package</span>
          <span>Trade</span>
          <span>Budget</span>
          <span>Total PO</span>
          <span>Cost to Date</span>
          <span>Remaining Budget</span>
          <span>Status</span>
          <span />
        </div>
        {rows.map((item, index) => (
          <div
            className={`materials-row${Number(item.remainingBudget) < 0 ? " over" : ""}`}
            key={item.id}
          >
            <span>{index + 1}</span>
            <span>
              <b>{item.description}</b>
              <small>
                {item.costCode.code} · {item.purchaseOrders.length} PO
                {item.purchaseOrders.length === 1 ? "" : "s"}
              </small>
            </span>
            <span>{item.package.name}</span>
            <span>{item.trade.name}</span>
            <span>{amount(item.currentBudget)}</span>
            <span>{amount(item.totalPoAmount)}</span>
            <span>
              {item.purchaseOrders.length ? amount(item.costToDate) : "—"}
            </span>
            <span
              className={Number(item.remainingBudget) < 0 ? "negative" : ""}
            >
              {amount(item.remainingBudget)}
            </span>
            <span>
              <Status value={item.status} />
            </span>
            <span>
              <button className="open-link" onClick={() => setSelected(item)}>
                Open <ChevronRight />
              </button>
            </span>
          </div>
        ))}
        {!rows.length && (
          <div className="empty">
            <h3>No materials match this view.</h3>
            <p>Adjust the filters or add a material budget item.</p>
          </div>
        )}
      </div>
      {edit && (
        <MaterialModal
          material={edit === true ? undefined : edit}
          data={data}
          projectId={projectId}
          onClose={() => setEdit(undefined)}
          onSaved={() => {
            setEdit(undefined);
            load();
          }}
        />
      )}
      {selected && (
        <MaterialDrawer
          item={selected}
          canWrite={canWrite}
          onClose={() => setSelected(undefined)}
          onEdit={() => setEdit(selected)}
          onAddPo={() => setPoEdit(true)}
          onEditPo={(po) => setPoEdit(po)}
          onViewHistory={(po) => setHistoryPo(po)}
          onUpdateReceived={(po) => setReceivedPo(po)}
          onReallocate={onOpenBudget}
          onStatusChange={async (nextStatus) => {
            await api(`/projects/${projectId}/materials/${selected.id}`, {
              method: "PUT",
              body: JSON.stringify({
                description: selected.description,
                packageId: selected.packageId,
                tradeId: selected.tradeId,
                budget: selected.currentBudget,
                currency: selected.currency,
                status: nextStatus,
                remarks: selected.notes || null,
              }),
            });
            await load();
          }}
        />
      )}
      {poEdit && selected && (
        <PoModal
          projectId={projectId}
          material={selected}
          po={poEdit === true ? undefined : poEdit}
          suppliers={data.suppliers.filter((row) => row.active)}
          onClose={() => setPoEdit(undefined)}
          onSaved={() => {
            setPoEdit(undefined);
            load();
          }}
        />
      )}
      {historyPo && (
        <HistoryModal po={historyPo} onClose={() => setHistoryPo(undefined)} />
      )}
      {receivedPo && selected && (
        <ReceivedMaterialModal
          projectId={projectId}
          material={selected}
          po={receivedPo}
          onClose={() => setReceivedPo(undefined)}
          onSaved={() => {
            setReceivedPo(undefined);
            load();
          }}
        />
      )}
      {supplierManager && (
        <SupplierManager
          projectId={projectId}
          suppliers={data.suppliers}
          onClose={() => setSupplierManager(false)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className={`material-metric ${tone || ""}`}>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}
function Filter({
  value,
  onChange,
  label,
  rows,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  rows: Dimension[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="ALL">{label}</option>
      {rows.map((row) => (
        <option value={row.id} key={row.id}>
          {row.name}
        </option>
      ))}
    </select>
  );
}
function Status({ value }: { value: string }) {
  return (
    <span className={`material-status ${value.toLowerCase()}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}

function MaterialModal({
  material,
  data,
  projectId,
  onClose,
  onSaved,
}: {
  material?: Material;
  data: MaterialsData;
  projectId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await api(
        `/projects/${projectId}/materials${material ? `/${material.id}` : ""}`,
        {
          method: material ? "PUT" : "POST",
          body: JSON.stringify({
            description: form.get("description"),
            packageId: form.get("packageId"),
            tradeId: form.get("tradeId"),
            budget: form.get("budget"),
            currency: material?.currency || "SAR",
            status: form.get("status"),
            remarks: form.get("remarks") || null,
          }),
        },
      );
      onSaved();
    } catch (reason) {
      setError((reason as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="modal-bg drawer-modal-bg">
      <form className="modal small" onSubmit={save}>
        <header>
          <div>
            <p className="eyebrow">Materials control</p>
            <h2>{material ? "Edit Material" : "Add Material Budget Item"}</h2>
          </div>
          <button type="button" className="icon" onClick={onClose}>
            <X />
          </button>
        </header>
        {error && <div className="error">{error}</div>}
        <div className="form-grid one">
          <label>
            Description
            <input
              name="description"
              required
              autoFocus
              defaultValue={material?.description}
            />
          </label>
          <label>
            Package
            <select
              name="packageId"
              required
              defaultValue={material?.packageId || ""}
            >
              <option value="" disabled>
                Select Package
              </option>
              {data.packages.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Trade
            <select
              name="tradeId"
              required
              defaultValue={material?.tradeId || ""}
            >
              <option value="" disabled>
                Select Trade
              </option>
              {data.trades.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Budget
            <input
              name="budget"
              required
              type="number"
              min="0"
              step="0.01"
              defaultValue={material?.currentBudget}
            />
          </label>
          <label>
            Status
            <select name="status" defaultValue={material?.status || "ACTIVE"}>
              <option value="ACTIVE">Active</option>
              <option value="CLOSED">Closed</option>
              <option value="ON_HOLD">On Hold</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </label>
          <label>
            Remarks
            <textarea name="remarks" defaultValue={material?.notes} />
          </label>
        </div>
        <footer>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button disabled={busy}>{busy ? "Saving…" : "Save Material"}</button>
        </footer>
      </form>
    </div>
  );
}

function MaterialDrawer({
  item,
  canWrite,
  onClose,
  onEdit,
  onAddPo,
  onEditPo,
  onViewHistory,
  onUpdateReceived,
  onReallocate,
  onStatusChange,
}: {
  item: Material;
  canWrite: boolean;
  onClose: () => void;
  onEdit: () => void;
  onAddPo: () => void;
  onEditPo: (po: PurchaseOrder) => void;
  onViewHistory: (po: PurchaseOrder) => void;
  onUpdateReceived: (po: PurchaseOrder) => void;
  onReallocate: () => void;
  onStatusChange: (status: Material["status"]) => Promise<void>;
}) {
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState("");
  async function changeStatus(status: Material["status"]) {
    setStatusBusy(true);
    setStatusError("");
    try {
      await onStatusChange(status);
    } catch (reason) {
      setStatusError((reason as Error).message);
    } finally {
      setStatusBusy(false);
    }
  }
  return (
    <div
      className="drawer-bg"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <aside className="material-drawer">
        <header>
          <div>
            <p className="eyebrow">Material detail</p>
            <h2>{item.description}</h2>
            <small>{item.costCode.code}</small>
          </div>
          <button className="icon" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="material-meta">
          <span>
            <small>Package</small>
            <b>{item.package.name}</b>
          </span>
          <span>
            <small>Trade</small>
            <b>{item.trade.name}</b>
          </span>
          <span>
            <small>Status</small>
            {canWrite ? (
              <select
                className="material-status-select"
                value={item.status}
                disabled={statusBusy}
                onChange={(event) =>
                  void changeStatus(event.target.value as Material["status"])
                }
              >
                <option value="ACTIVE">Active</option>
                <option value="CLOSED">Closed</option>
                <option value="ON_HOLD">On Hold</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            ) : (
              <Status value={item.status} />
            )}
          </span>
          <span>
            <small>Remarks</small>
            <b>{item.notes || "—"}</b>
          </span>
        </div>
        {statusError && <div className="error">{statusError}</div>}
        {item.status === "CLOSED" && Number(item.remainingBudget) > 0 && (
          <p className="status-note">
            This material is closed. Its positive remaining budget is available
            for controlled reallocation.
          </p>
        )}
        <section>
          <div className="section-heading">
            <h3>Budget Control</h3>
            {canWrite && (
              <button className="secondary" onClick={onEdit}>
                Edit Material
              </button>
            )}
          </div>
          <div className="detail-financials">
            <Metric
              label="Original Budget"
              value={cash(item.originalBudget, item.currency)}
            />
            <Metric
              label="Current Budget"
              value={cash(item.currentBudget, item.currency)}
            />
            <Metric
              label="Total PO Amount"
              value={cash(item.totalPoAmount, item.currency)}
            />
            <Metric
              label="Cost to Date"
              value={
                item.purchaseOrders.length
                  ? cash(item.costToDate, item.currency)
                  : "—"
              }
            />
            <Metric
              label="Remaining Budget"
              value={cash(item.remainingBudget, item.currency)}
              tone={Number(item.remainingBudget) < 0 ? "danger" : undefined}
            />
            <Metric
              label="Total Accruals"
              value={cash(item.totalAccruals, item.currency)}
            />
            <Metric
              label="Total Paid"
              value={cash(item.totalPaid, item.currency)}
            />
          </div>
          {Number(item.availableToReallocate) > 0 && (
            <div className="available-banner">
              <div>
                <b>Available to Reallocate</b>
                <strong>
                  {cash(item.availableToReallocate, item.currency)}
                </strong>
              </div>
              <button onClick={onReallocate}>Reallocate</button>
            </div>
          )}
          {Number(item.overBudget) > 0 && (
            <div className="over-budget-banner">
              <AlertTriangle />
              <div>
                <b>Over Budget</b>
                <strong>{cash(item.overBudget, item.currency)}</strong>
              </div>
            </div>
          )}
        </section>
        <section>
          <div className="section-heading">
            <div>
              <h3>Purchase Orders</h3>
              <p>
                {item.purchaseOrders.length} purchase order
                {item.purchaseOrders.length === 1 ? "" : "s"}
              </p>
            </div>
            {canWrite && (
              <button onClick={onAddPo}>
                <Plus /> Add Purchase Order
              </button>
            )}
          </div>
          <div className="po-list">
            {item.purchaseOrders.map((po) => (
              <article className="po-card" key={po.id}>
                <header>
                  <div>
                    <b>PO #{po.poNumber}</b>
                    <span>{po.supplier.name}</span>
                  </div>
                  <Status value={po.status} />
                </header>
                <div className="po-grid">
                  <span>
                    <small>Date</small>
                    <b>{date(po.poDate)}</b>
                  </span>
                  <span>
                    <small>PO Amount</small>
                    <b>{cash(po.poAmount, item.currency)}</b>
                  </span>
                  <span>
                    <small>Received Material</small>
                    <b>{cash(po.receivedMaterialValue, item.currency)}</b>
                  </span>
                  <span>
                    <small>Remaining Material</small>
                    <b>{cash(po.remainingMaterialAmount, item.currency)}</b>
                  </span>
                  <span>
                    <small>Accruals</small>
                    <b>{cash(po.accruals, item.currency)}</b>
                  </span>
                  <span>
                    <small>Paid</small>
                    <b>{cash(po.paid, item.currency)}</b>
                  </span>
                  <span>
                    <small>Cost to Date</small>
                    <b>{cash(po.costToDate, item.currency)}</b>
                  </span>
                </div>
                {po.notes && <p>{po.notes}</p>}
                {canWrite && (
                  <footer>
                    <button
                      className="table-action"
                      onClick={() => onEditPo(po)}
                    >
                      Edit PO
                    </button>
                    <button
                      className="table-action received-action"
                      onClick={() => onUpdateReceived(po)}
                    >
                      Update Received
                    </button>
                    <button
                      className="table-action"
                      onClick={() => onViewHistory(po)}
                    >
                      View History
                    </button>
                  </footer>
                )}
              </article>
            ))}
            {!item.purchaseOrders.length && (
              <div className="empty compact">
                <h3>No purchase orders yet</h3>
                <p>Add POs as commitments are placed.</p>
              </div>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}

function ReceivedMaterialModal({
  projectId,
  material,
  po,
  onClose,
  onSaved,
}: {
  projectId: string;
  material: Material;
  po: PurchaseOrder;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [received, setReceived] = useState(po.receivedMaterialValue);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        `/projects/${projectId}/materials/${material.id}/purchase-orders/${po.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            poNumber: po.poNumber,
            supplierName: po.supplier.name,
            poDate: po.poDate.slice(0, 10),
            poAmount: po.poAmount,
            receivedMaterialValue: received,
            accruals: po.accruals,
            paid: po.paid,
            notes: po.notes || null,
            status:
              po.status === "CLOSED" || po.status === "CANCELLED"
                ? po.status
                : Number(received) >= Number(po.poAmount)
                  ? "FULLY_RECEIVED"
                  : Number(received) > 0
                    ? "PARTIALLY_RECEIVED"
                    : po.status,
          }),
        },
      );
      onSaved();
    } catch (reason) {
      setError((reason as Error).message);
      setBusy(false);
    }
  }
  const remaining = Number(po.poAmount) - Number(received || 0);
  return (
    <div className="modal-bg drawer-modal-bg">
      <form className="modal received-modal" onSubmit={save}>
        <header>
          <div>
            <p className="eyebrow">PO #{po.poNumber}</p>
            <h2>Update Received Material</h2>
            <p className="muted">{material.description}</p>
          </div>
          <button type="button" className="icon" onClick={onClose}>
            <X />
          </button>
        </header>
        {error && <div className="error">{error}</div>}
        <div className="received-context">
          <span>
            <small>PO Amount</small>
            <b>{cash(po.poAmount, material.currency)}</b>
          </span>
          <span>
            <small>Previously Received</small>
            <b>{cash(po.receivedMaterialValue, material.currency)}</b>
          </span>
        </div>
        <label>
          Total Received Material Value
          <input
            autoFocus
            required
            type="number"
            min="0"
            step="0.01"
            value={received}
            onChange={(event) => setReceived(event.target.value)}
          />
          <small>Enter the cumulative value received against this PO.</small>
        </label>
        <div className={`received-result${remaining < 0 ? " over" : ""}`}>
          <small>Remaining Material Amount</small>
          <strong>{cash(remaining, material.currency)}</strong>
        </div>
        <footer>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button disabled={busy}>
            {busy ? "Saving…" : "Save Received Value"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function HistoryModal({
  po,
  onClose,
}: {
  po: PurchaseOrder;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<
    Array<{
      id: string;
      action: string;
      createdAt: string;
      oldValue?: Record<string, unknown>;
      newValue?: Record<string, unknown>;
      user?: { name: string };
    }>
  >([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api<typeof rows>(
      `/audit-logs?entity=MaterialPurchaseOrder&entityId=${po.id}`,
    )
      .then(setRows)
      .catch((reason) => setError(reason.message));
  }, [po.id]);
  return (
    <div className="modal-bg drawer-modal-bg">
      <div className="modal small">
        <header>
          <div>
            <p className="eyebrow">Audit trail</p>
            <h2>PO #{po.poNumber} History</h2>
          </div>
          <button className="icon" onClick={onClose}>
            <X />
          </button>
        </header>
        {error && <div className="error">{error}</div>}
        <div className="history-list">
          {rows.map((row) => (
            <article key={row.id}>
              <b>{row.action.replaceAll("_", " ")}</b>
              <span>
                {row.user?.name || "System"} · {date(row.createdAt)}
              </span>
            </article>
          ))}
          {!error && !rows.length && (
            <div className="empty compact">
              <p>No history recorded.</p>
            </div>
          )}
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

function SupplierManager({
  projectId,
  suppliers,
  onClose,
  onChanged,
}: {
  projectId: string;
  suppliers: Dimension[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<Dimension>();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        `/projects/${projectId}/suppliers${editing ? `/${editing.id}` : ""}`,
        {
          method: editing ? "PUT" : "POST",
          body: JSON.stringify({ name, active: true }),
        },
      );
      setEditing(undefined);
      setName("");
      setBusy(false);
      onChanged();
    } catch (reason) {
      setError((reason as Error).message);
      setBusy(false);
    }
  }
  async function toggle(row: Dimension) {
    setError("");
    try {
      await api(`/projects/${projectId}/suppliers/${row.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: row.name, active: !row.active }),
      });
      onChanged();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }
  return (
    <div className="modal-bg">
      <div className="modal small supplier-modal">
        <header>
          <div>
            <p className="eyebrow">Project register</p>
            <h2>Suppliers</h2>
            <p className="muted">
              Maintain the suppliers available when creating purchase orders.
            </p>
          </div>
          <button className="icon" onClick={onClose}>
            <X />
          </button>
        </header>
        {error && <div className="error">{error}</div>}
        <div className="supplier-list">
          {suppliers.map((row) => (
            <div className="supplier-row" key={row.id}>
              <span>
                <b>{row.name}</b>
                <small>{row.active ? "Active" : "Inactive"}</small>
              </span>
              <div>
                <button
                  className="table-action"
                  onClick={() => {
                    setEditing(row);
                    setName(row.name);
                  }}
                >
                  Edit
                </button>
                <button
                  className="table-action"
                  onClick={() => void toggle(row)}
                >
                  {row.active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          ))}
          {!suppliers.length && (
            <div className="empty compact">
              <p>No registered suppliers yet.</p>
            </div>
          )}
        </div>
        <form className="supplier-add" onSubmit={save}>
          <label>
            {editing ? "Supplier Name" : "Register New Supplier"}
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              minLength={2}
              placeholder="Supplier legal or trading name"
            />
          </label>
          <div>
            {editing && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setEditing(undefined);
                  setName("");
                }}
              >
                Cancel Edit
              </button>
            )}
            <button disabled={busy || name.trim().length < 2}>
              {busy
                ? "Saving…"
                : editing
                  ? "Save Supplier"
                  : "Register Supplier"}
            </button>
          </div>
        </form>
        <footer>
          <button className="secondary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}

function PoModal({
  projectId,
  material,
  po,
  suppliers,
  onClose,
  onSaved,
}: {
  projectId: string;
  material: Material;
  po?: PurchaseOrder;
  suppliers: Dimension[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [amountValue, setAmountValue] = useState(po?.poAmount || "0");
  const [received, setReceived] = useState(po?.receivedMaterialValue || "0");
  const [accruals, setAccruals] = useState(po?.accruals || "0");
  const [paid, setPaid] = useState(po?.paid || "0");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await api(
        `/projects/${projectId}/materials/${material.id}/purchase-orders${po ? `/${po.id}` : ""}`,
        {
          method: po ? "PUT" : "POST",
          body: JSON.stringify({
            poNumber: form.get("poNumber"),
            supplierName: form.get("supplierName"),
            poDate: form.get("poDate"),
            poAmount: amountValue,
            receivedMaterialValue: received,
            accruals,
            paid,
            notes: form.get("notes") || null,
            status: form.get("status"),
          }),
        },
      );
      onSaved();
    } catch (reason) {
      setError((reason as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="modal-bg drawer-modal-bg">
      <form className="modal po-modal" onSubmit={save}>
        <header>
          <div>
            <p className="eyebrow">{material.description}</p>
            <h2>{po ? "Edit Purchase Order" : "Add Purchase Order"}</h2>
          </div>
          <button type="button" className="icon" onClick={onClose}>
            <X />
          </button>
        </header>
        {error && <div className="error">{error}</div>}
        <div className="form-grid">
          <label>
            PO Number
            <input name="poNumber" required defaultValue={po?.poNumber} />
          </label>
          <label>
            Supplier
            <select
              name="supplierName"
              required
              defaultValue={po?.supplier.name || ""}
            >
              <option value="" disabled>
                Select Supplier
              </option>
              {suppliers.map((row) => (
                <option value={row.name} key={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
            {!suppliers.length && (
              <small>Register a supplier before adding a PO.</small>
            )}
          </label>
          <label>
            PO Date
            <input
              name="poDate"
              type="date"
              required
              defaultValue={po?.poDate.slice(0, 10)}
            />
          </label>
          <label>
            PO Status
            <select name="status" defaultValue={po?.status || "OPEN"}>
              <option value="OPEN">Open</option>
              <option value="PARTIALLY_RECEIVED">Partially Received</option>
              <option value="FULLY_RECEIVED">Fully Received</option>
              <option value="CLOSED">Closed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </label>
          <label>
            PO Amount
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={amountValue}
              onChange={(e) => setAmountValue(e.target.value)}
            />
          </label>
          <label>
            Received Material Value
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={received}
              onChange={(e) => setReceived(e.target.value)}
            />
          </label>
          <label>
            Accruals
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={accruals}
              onChange={(e) => setAccruals(e.target.value)}
            />
          </label>
          <label>
            Paid
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={paid}
              onChange={(e) => setPaid(e.target.value)}
            />
          </label>
          <label className="full">
            Notes
            <textarea name="notes" defaultValue={po?.notes} />
          </label>
        </div>
        <div className="calculated-preview">
          <span>
            <small>Remaining Material Amount</small>
            <b>
              {cash(
                Number(amountValue || 0) - Number(received || 0),
                material.currency,
              )}
            </b>
          </span>
          <span>
            <small>PO Cost to Date</small>
            <b>
              {cash(
                Number(accruals || 0) + Number(paid || 0),
                material.currency,
              )}
            </b>
          </span>
        </div>
        <footer>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button disabled={busy}>
            {busy ? "Saving…" : "Save Purchase Order"}
          </button>
        </footer>
      </form>
    </div>
  );
}

const amount = (value: string | number) =>
  Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
const cash = (value: string | number, currency: string) =>
  `${currency} ${amount(value)}`;
const date = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
