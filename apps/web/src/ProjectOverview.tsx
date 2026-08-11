import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  Boxes,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  Layers3,
  TrendingUp,
} from "lucide-react";
import { api, type Project } from "./api";

type BudgetData = {
  summary: {
    totalBudget: string;
    originalBudget: string;
    approvedChanges: string;
    itemCount: number;
    categoryCount: number;
    currency: string;
  };
  categorySummary: Array<{
    id: string;
    name: string;
    itemCount: number;
    currentApprovedBudget: string;
  }>;
};
type Material = {
  status: string;
  totalPoAmount: string;
  currentBudget: string;
  receivedMaterialValue?: string;
  remainingBudget: string;
  availableToReallocate: string;
  overBudget: string;
  purchaseOrders: Array<{
    status: string;
    poAmount: string;
    receivedMaterialValue: string;
    remainingMaterialAmount: string;
  }>;
};
type MaterialData = {
  materials: Material[];
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

export default function ProjectOverview({
  project,
  onOpen,
}: {
  project: Project;
  onOpen: (module: string) => void;
}) {
  const [budget, setBudget] = useState<BudgetData>();
  const [materials, setMaterials] = useState<MaterialData>();
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      api<BudgetData>(`/projects/${project.id}/budget`),
      api<MaterialData>(`/projects/${project.id}/materials`),
    ])
      .then(([budgetResult, materialResult]) => {
        setBudget(budgetResult);
        setMaterials(materialResult);
      })
      .catch((reason) => setError(reason.message));
  }, [project.id]);
  const poRows = useMemo(
    () => materials?.materials.flatMap((item) => item.purchaseOrders) || [],
    [materials],
  );
  if (error) return <div className="error">{error}</div>;
  if (!budget || !materials)
    return (
      <div className="center">
        <div className="spinner" />
      </div>
    );
  const currency = budget.summary.currency;
  const totalBudget = Number(budget.summary.totalBudget);
  const materialBudget = Number(materials.summary.totalBudget);
  const totalPo = Number(materials.summary.totalPoAmount);
  const received = poRows
    .filter((po) => po.status !== "CANCELLED")
    .reduce((total, po) => total + Number(po.receivedMaterialValue), 0);
  const poBase = poRows
    .filter((po) => po.status !== "CANCELLED")
    .reduce((total, po) => total + Number(po.poAmount), 0);
  const committedPct = ratio(totalPo, materialBudget);
  const receivedPct = ratio(received, poBase);
  const recognizedPct = ratio(Number(materials.summary.costToDate), totalPo);
  const categories = budget.categorySummary
    .filter((row) => Number(row.currentApprovedBudget) > 0)
    .sort(
      (a, b) =>
        Number(b.currentApprovedBudget) - Number(a.currentApprovedBudget),
    );
  const closed = materials.materials.filter(
    (item) => item.status === "CLOSED",
  ).length;
  const atRisk = materials.materials.filter(
    (item) => Number(item.overBudget) > 0,
  ).length;
  const available = Number(materials.summary.availableToReallocate);
  const contractValue = Number(project.contractValue || 0);
  const budgetToContract = ratio(totalBudget, contractValue);
  return (
    <div className="executive-overview">
      <section className="overview-hero">
        <div className="overview-hero-copy">
          <p className="eyebrow">Executive cost command</p>
          <h2>Project Financial Overview</h2>
          <p>
            Live budget, commitment, receiving, and cost-control intelligence
            for {project.name}.
          </p>
          <div className="overview-pills">
            <span>{budget.summary.categoryCount} funded categories</span>
            <span>{budget.summary.itemCount} budget items</span>
            <span>{poRows.length} purchase orders</span>
          </div>
        </div>
        <div className="hero-orbit">
          <div className="orbit-ring orbit-one" />
          <div className="orbit-ring orbit-two" />
          <div className="hero-sphere">
            <small>Total Project Budget</small>
            <strong>{compact(totalBudget, currency)}</strong>
            <span>
              {budgetToContract
                ? `${budgetToContract}% of contract`
                : "Approved control baseline"}
            </span>
          </div>
        </div>
      </section>

      <section className="overview-stat-grid">
        <Stat
          icon={<Banknote />}
          label="Original Budget"
          value={cash(budget.summary.originalBudget, currency)}
          note="Protected baseline"
        />
        <Stat
          icon={<TrendingUp />}
          label="Approved Changes"
          value={signed(budget.summary.approvedChanges, currency)}
          note="Controlled revisions"
          tone={Number(budget.summary.approvedChanges) < 0 ? "warn" : ""}
        />
        <Stat
          icon={<FileText />}
          label="Material PO Exposure"
          value={cash(materials.summary.totalPoAmount, currency)}
          note={`${poRows.length} registered purchase orders`}
        />
        <Stat
          icon={<CircleDollarSign />}
          label="Available to Reallocate"
          value={cash(available, currency)}
          note={`${closed} closed material records`}
          tone={available > 0 ? "good" : ""}
        />
      </section>

      <section className="sphere-panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Material control cycle</p>
            <h3>Financial Velocity</h3>
          </div>
          <button className="secondary" onClick={() => onOpen("Materials")}>
            Open Materials <ArrowUpRight />
          </button>
        </div>
        <div className="sphere-grid">
          <Sphere
            value={committedPct}
            label="Budget Committed"
            amount={cash(totalPo, currency)}
            color="#1684b3"
          />
          <Sphere
            value={receivedPct}
            label="PO Value Received"
            amount={cash(received, currency)}
            color="#26a574"
          />
          <Sphere
            value={recognizedPct}
            label="Cost Recognized"
            amount={cash(materials.summary.costToDate, currency)}
            color="#d88a2c"
          />
          <div className="control-signal">
            <span
              className={atRisk ? "signal-icon danger" : "signal-icon good"}
            >
              {atRisk ? <AlertTriangle /> : <CheckCircle2 />}
            </span>
            <small>Control Signal</small>
            <strong>
              {atRisk
                ? `${atRisk} material${atRisk === 1 ? "" : "s"} over budget`
                : "Financial exposure controlled"}
            </strong>
            <p>
              {atRisk
                ? `${cash(materials.summary.overBudget, currency)} requires management attention.`
                : "No material budget overruns detected from current PO exposure."}
            </p>
          </div>
        </div>
      </section>

      <div className="overview-lower-grid">
        <section className="allocation-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">Approved distribution</p>
              <h3>Budget by Category</h3>
            </div>
            <Layers3 />
          </div>
          <div className="allocation-body">
            <Donut categories={categories} total={totalBudget} />
            <div className="allocation-list">
              {categories.slice(0, 7).map((row, index) => {
                const value = Number(row.currentApprovedBudget);
                const pct = ratio(value, totalBudget);
                return (
                  <div className="allocation-row" key={row.id}>
                    <span className={`allocation-dot c${index % 6}`} />
                    <div>
                      <span>
                        <b>{row.name}</b>
                        <small>{pct}%</small>
                      </span>
                      <i>
                        <em
                          className={`c${index % 6}`}
                          style={{ width: `${pct}%` }}
                        />
                      </i>
                    </div>
                    <strong>{compact(value, currency)}</strong>
                  </div>
                );
              })}
              {!categories.length && (
                <div className="empty compact">
                  <p>No funded categories yet.</p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="intelligence-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">Management intelligence</p>
              <h3>Decision Signals</h3>
            </div>
            <Boxes />
          </div>
          <Signal
            title="Uncommitted Material Budget"
            value={cash(materials.summary.remainingBudget, currency)}
            text="Current material budget less registered PO exposure."
            tone={
              Number(materials.summary.remainingBudget) < 0 ? "danger" : "blue"
            }
          />
          <Signal
            title="Receiving Pipeline"
            value={cash(
              poRows
                .filter((po) => po.status !== "CANCELLED")
                .reduce(
                  (total, po) => total + Number(po.remainingMaterialAmount),
                  0,
                ),
              currency,
            )}
            text="PO value still awaiting material receipt."
            tone="orange"
          />
          <Signal
            title="Closed Budget Opportunity"
            value={cash(available, currency)}
            text="Positive balance available for controlled reallocation."
            tone={available > 0 ? "green" : "muted"}
          />
          <button onClick={() => onOpen("Purchase Orders")}>
            Review Purchase Orders <ArrowUpRight />
          </button>
        </section>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  note,
  tone = "",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note: string;
  tone?: string;
}) {
  return (
    <div className={`overview-stat ${tone}`}>
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{note}</p>
      </div>
    </div>
  );
}
function Sphere({
  value,
  label,
  amount,
  color,
}: {
  value: number;
  label: string;
  amount: string;
  color: string;
}) {
  const style = {
    "--sphere-value": `${Math.min(value, 100) * 3.6}deg`,
    "--sphere-color": color,
  } as CSSProperties;
  return (
    <div className="sphere-card">
      <div className="progress-sphere" style={style}>
        <div>
          <strong>{value}%</strong>
          <small>of value</small>
        </div>
      </div>
      <b>{label}</b>
      <span>{amount}</span>
    </div>
  );
}
function Donut({
  categories,
  total,
}: {
  categories: BudgetData["categorySummary"];
  total: number;
}) {
  const colors = [
    "#1684b3",
    "#26a574",
    "#d88a2c",
    "#7059b8",
    "#cf5d68",
    "#4a98a1",
  ];
  let cursor = 0;
  const stops = categories.slice(0, 6).map((row, index) => {
    const start = cursor;
    cursor += ratio(Number(row.currentApprovedBudget), total);
    return `${colors[index]} ${start}% ${cursor}%`;
  });
  const style = {
    background: stops.length ? `conic-gradient(${stops.join(",")})` : "#e8eef1",
  };
  return (
    <div className="allocation-donut" style={style}>
      <div>
        <strong>{categories.length}</strong>
        <small>Categories</small>
      </div>
    </div>
  );
}
function Signal({
  title,
  value,
  text,
  tone,
}: {
  title: string;
  value: string;
  text: string;
  tone: string;
}) {
  return (
    <div className={`decision-signal ${tone}`}>
      <span />
      <div>
        <small>{title}</small>
        <strong>{value}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}
const ratio = (value: number, base: number) =>
  base > 0 ? Math.round((value / base) * 100) : 0;
const cash = (value: string | number, currency: string) =>
  `${currency} ${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const signed = (value: string | number, currency: string) =>
  `${Number(value) > 0 ? "+" : ""}${cash(value, currency)}`;
const compact = (value: number, currency: string) =>
  `${currency} ${Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 2 }).format(value)}`;
