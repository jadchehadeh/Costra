import { useEffect, useMemo, useState } from "react";
import { ChevronRight, FileText, Search } from "lucide-react";
import { api } from "./api";

type Dimension = { id: string; name: string; active: boolean };
type Po = {
  id: string;
  poNumber: string;
  poDate: string;
  poAmount: string;
  receivedMaterialValue: string;
  remainingMaterialAmount: string;
  accruals: string;
  paid: string;
  costToDate: string;
  status: string;
  supplier: Dimension;
};
type Material = {
  id: string;
  description: string;
  currency: string;
  package: Dimension;
  trade: Dimension;
  purchaseOrders: Po[];
};
type Data = {
  materials: Material[];
  packages: Dimension[];
  trades: Dimension[];
  suppliers: Dimension[];
  summary: { currency: string };
};
type Row = Po & { material: Material };

export default function PurchaseOrders({
  projectId,
  onOpenMaterials,
}: {
  projectId: string;
  onOpenMaterials: () => void;
}) {
  const [data, setData] = useState<Data>();
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [supplier, setSupplier] = useState("ALL");
  const [trade, setTrade] = useState("ALL");
  const [projectPackage, setProjectPackage] = useState("ALL");
  useEffect(() => {
    api<Data>(`/projects/${projectId}/materials`)
      .then(setData)
      .catch((reason) => setError(reason.message));
  }, [projectId]);
  const allRows = useMemo(
    () =>
      data?.materials.flatMap((material) =>
        material.purchaseOrders.map((po) => ({ ...po, material })),
      ) || [],
    [data],
  );
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allRows.filter(
      (row) =>
        (!term ||
          `${row.poNumber} ${row.supplier.name} ${row.material.description} ${row.material.package.name} ${row.material.trade.name}`
            .toLowerCase()
            .includes(term)) &&
        (status === "ALL" || row.status === status) &&
        (supplier === "ALL" || row.supplier.id === supplier) &&
        (trade === "ALL" || row.material.trade.id === trade) &&
        (projectPackage === "ALL" ||
          row.material.package.id === projectPackage),
    );
  }, [allRows, search, status, supplier, trade, projectPackage]);
  if (error) return <div className="error">{error}</div>;
  if (!data)
    return (
      <div className="center">
        <div className="spinner" />
      </div>
    );
  const included = rows.filter((row) => row.status !== "CANCELLED");
  const sum = (
    field: keyof Pick<
      Po,
      | "poAmount"
      | "receivedMaterialValue"
      | "remainingMaterialAmount"
      | "accruals"
      | "paid"
      | "costToDate"
    >,
  ) => included.reduce((total, row) => total + Number(row[field]), 0);
  const currency = data.summary.currency;
  return (
    <div className="po-register">
      <div className="budget-title">
        <div>
          <p className="eyebrow">Project commitments</p>
          <h2>Purchase Orders</h2>
          <p className="muted">
            A project-wide register of material purchase orders.
          </p>
        </div>
        <button className="secondary" onClick={onOpenMaterials}>
          Manage in Materials <ChevronRight />
        </button>
      </div>
      <div className="po-register-kpis">
        <div className="po-count-card">
          <FileText />
          <span>
            <small>Total Purchase Orders</small>
            <strong>{included.length}</strong>
          </span>
        </div>
        <Metric
          label="Total PO Amount"
          value={cash(sum("poAmount"), currency)}
        />
        <Metric
          label="Received Material"
          value={cash(sum("receivedMaterialValue"), currency)}
        />
        <Metric
          label="Remaining Material"
          value={cash(sum("remainingMaterialAmount"), currency)}
        />
        <Metric
          label="Total Accruals"
          value={cash(sum("accruals"), currency)}
        />
        <Metric label="Total Paid" value={cash(sum("paid"), currency)} />
        <Metric
          label="Cost to Date"
          value={cash(sum("costToDate"), currency)}
        />
      </div>
      <div className="po-register-filters">
        <label className="search">
          <Search />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search PO, supplier or material"
          />
        </label>
        <Select
          label="All suppliers"
          value={supplier}
          onChange={setSupplier}
          rows={data.suppliers}
        />
        <Select
          label="All trades"
          value={trade}
          onChange={setTrade}
          rows={data.trades}
        />
        <Select
          label="All packages"
          value={projectPackage}
          onChange={setProjectPackage}
          rows={data.packages}
        />
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="ALL">All PO statuses</option>
          <option value="OPEN">Open</option>
          <option value="PARTIALLY_RECEIVED">Partially Received</option>
          <option value="FULLY_RECEIVED">Fully Received</option>
          <option value="CLOSED">Closed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>
      <div className="po-register-table">
        <div className="po-register-head">
          <span>#</span>
          <span>PO / Supplier</span>
          <span>Material</span>
          <span>Package / Trade</span>
          <span>Date</span>
          <span>PO Amount</span>
          <span>Received</span>
          <span>Remaining Material</span>
          <span>Accruals</span>
          <span>Paid</span>
          <span>Cost to Date</span>
          <span>Status</span>
        </div>
        {rows.map((row, index) => (
          <div
            className={`po-register-row${Number(row.remainingMaterialAmount) < 0 ? " over" : ""}`}
            key={row.id}
          >
            <span>{index + 1}</span>
            <span>
              <b>PO #{row.poNumber}</b>
              <small>{row.supplier.name}</small>
            </span>
            <span>
              <b>{row.material.description}</b>
            </span>
            <span>
              <b>{row.material.package.name}</b>
              <small>{row.material.trade.name}</small>
            </span>
            <span>{date(row.poDate)}</span>
            <span>{amount(row.poAmount)}</span>
            <span>{amount(row.receivedMaterialValue)}</span>
            <span>{amount(row.remainingMaterialAmount)}</span>
            <span>{amount(row.accruals)}</span>
            <span>{amount(row.paid)}</span>
            <span>{amount(row.costToDate)}</span>
            <span>
              <Status value={row.status} />
            </span>
          </div>
        ))}
        {!rows.length && (
          <div className="empty">
            <FileText />
            <h3>No purchase orders found</h3>
            <p>Add a PO from a material record or adjust the filters.</p>
          </div>
        )}
      </div>
      <div className="po-register-total">
        <span>Filtered PO Amount</span>
        <strong>{cash(sum("poAmount"), currency)}</strong>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="material-metric">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}
function Select({
  label,
  value,
  onChange,
  rows,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: Dimension[];
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
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
const amount = (value: string | number) =>
  Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
const cash = (value: string | number, currency: string) =>
  `${currency} ${amount(value)}`;
const date = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
