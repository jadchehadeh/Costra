import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  ChevronRight,
  Plus,
  Search,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { api } from "./api";

type Category = {
  id: string;
  name: string;
  kind: "STAFF" | "OTHER";
  originalBudget: string;
  currentBudget: string;
  displayOrder: number;
};
type Summary = Category & {
  staffCost: string;
  otherCost: string;
  costToDate: string;
  remainingBudget: string;
  overBudget: string;
};
type Month = {
  id: string;
  month: string;
  salary: string;
  wphPercent: string;
  totalAmount: string;
  remarks?: string;
};
type Employee = {
  id: string;
  employeeNumber: number;
  position: string;
  name: string;
  employeeId: string;
  categoryId: string;
  category: Category;
  status: "ACTIVE" | "INACTIVE" | "LEFT_PROJECT";
  remarks?: string;
  monthlyCosts: Month[];
  totalPaid: string;
};
type OtherCost = {
  id: string;
  item: string;
  poNumber: string;
  transactionDate: string;
  categoryId: string;
  category: Category;
  amount: string;
  remarks?: string;
  status: "OPEN" | "CLOSED" | "CANCELLED";
};
type Data = {
  categories: Category[];
  summary: Summary[];
  employees: Employee[];
  otherCosts: OtherCost[];
  totals: {
    budget: string;
    costToDate: string;
    remainingBudget: string;
    overBudget: string;
    staffCost: string;
    otherCost: string;
    staffCount: number;
    otherCostCount: number;
    currency: string;
  };
};

export default function PmeEngineering({
  projectId,
  canWrite,
}: {
  projectId: string;
  canWrite: boolean;
}) {
  const [data, setData] = useState<Data>();
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"OVERVIEW" | "STAFF" | "OTHER">("OVERVIEW");
  const [budgetEdit, setBudgetEdit] = useState<Summary>();
  const [employeeEdit, setEmployeeEdit] = useState<Employee | true>();
  const [selectedEmployee, setSelectedEmployee] = useState<Employee>();
  const [monthEdit, setMonthEdit] = useState<Month | true>();
  const [costEdit, setCostEdit] = useState<OtherCost | true>();
  const load = () =>
    api<Data>(`/projects/${projectId}/pme`)
      .then((r) => {
        setData(r);
        setSelectedEmployee((x) =>
          x ? r.employees.find((e) => e.id === x.id) : undefined,
        );
      })
      .catch((e) => setError(e.message));
  useEffect(() => void load(), [projectId]);
  if (error) return <div className="error">{error}</div>;
  if (!data)
    return (
      <div className="center">
        <div className="spinner" />
      </div>
    );
  return (
    <div className="pme-module">
      <div className="budget-title">
        <div>
          <p className="eyebrow">Project engineering control</p>
          <h2>PME / Engineering</h2>
          <p className="muted">
            Staff salary and project engineering operating-cost control.
          </p>
        </div>
      </div>
      <div className="pme-tabs">
        <button
          className={tab === "OVERVIEW" ? "active" : ""}
          onClick={() => setTab("OVERVIEW")}
        >
          Overview
        </button>
        <button
          className={tab === "STAFF" ? "active" : ""}
          onClick={() => setTab("STAFF")}
        >
          Staff Salary
        </button>
        <button
          className={tab === "OTHER" ? "active" : ""}
          onClick={() => setTab("OTHER")}
        >
          Other PME Costs
        </button>
      </div>
      {tab === "OVERVIEW" ? (
        <Overview
          data={data}
          canWrite={canWrite}
          onBudget={setBudgetEdit}
          onTab={setTab}
        />
      ) : tab === "STAFF" ? (
        <Staff
          data={data}
          canWrite={canWrite}
          onAdd={() => setEmployeeEdit(true)}
          onEdit={setEmployeeEdit}
          onOpen={setSelectedEmployee}
        />
      ) : (
        <Other
          data={data}
          canWrite={canWrite}
          onAdd={() => setCostEdit(true)}
          onEdit={setCostEdit}
        />
      )}{" "}
      {budgetEdit && (
        <BudgetModal
          projectId={projectId}
          row={budgetEdit}
          onClose={() => setBudgetEdit(undefined)}
          onSaved={() => {
            setBudgetEdit(undefined);
            load();
          }}
        />
      )}
      {employeeEdit && (
        <EmployeeModal
          projectId={projectId}
          categories={data.categories.filter((x) => x.kind === "STAFF")}
          employee={employeeEdit === true ? undefined : employeeEdit}
          onClose={() => setEmployeeEdit(undefined)}
          onSaved={() => {
            setEmployeeEdit(undefined);
            load();
          }}
        />
      )}
      {selectedEmployee && (
        <EmployeeDrawer
          employee={selectedEmployee}
          canWrite={canWrite}
          onClose={() => setSelectedEmployee(undefined)}
          onEdit={() => setEmployeeEdit(selectedEmployee)}
          onAddMonth={() => setMonthEdit(true)}
          onEditMonth={setMonthEdit}
        />
      )}{" "}
      {monthEdit && selectedEmployee && (
        <MonthModal
          projectId={projectId}
          employee={selectedEmployee}
          row={monthEdit === true ? undefined : monthEdit}
          onClose={() => setMonthEdit(undefined)}
          onSaved={() => {
            setMonthEdit(undefined);
            load();
          }}
        />
      )}
      {costEdit && (
        <CostModal
          projectId={projectId}
          categories={data.categories.filter((x) => x.kind === "OTHER")}
          row={costEdit === true ? undefined : costEdit}
          onClose={() => setCostEdit(undefined)}
          onSaved={() => {
            setCostEdit(undefined);
            load();
          }}
        />
      )}
    </div>
  );
}

function Overview({
  data,
  canWrite,
  onBudget,
  onTab,
}: {
  data: Data;
  canWrite: boolean;
  onBudget: (r: Summary) => void;
  onTab: (t: "STAFF" | "OTHER") => void;
}) {
  return (
    <>
      <div className="pme-kpis">
        <Kpi label="Total PME Budget" value={cash(data.totals.budget)} />
        <Kpi label="Cost to Date" value={cash(data.totals.costToDate)} />
        <Kpi
          label="Remaining Budget"
          value={cash(data.totals.remainingBudget)}
          tone={Number(data.totals.remainingBudget) < 0 ? "danger" : ""}
        />
        <Kpi
          label="Over Budget"
          value={cash(data.totals.overBudget)}
          tone={Number(data.totals.overBudget) > 0 ? "danger" : ""}
        />
        <Kpi label="Active Staff" value={String(data.totals.staffCount)} />
        <Kpi
          label="Other PME Costs"
          value={String(data.totals.otherCostCount)}
        />
      </div>
      <div className="pme-split-cards">
        <button onClick={() => onTab("STAFF")}>
          <Users />
          <span>
            <small>Staff Cost</small>
            <strong>{cash(data.totals.staffCost)}</strong>
          </span>
          <ChevronRight />
        </button>
        <button onClick={() => onTab("OTHER")}>
          <Wrench />
          <span>
            <small>Other PME Cost</small>
            <strong>{cash(data.totals.otherCost)}</strong>
          </span>
          <ChevronRight />
        </button>
      </div>
      <div className="pme-summary-grid">
        {data.summary.map((row, index) => (
          <article
            className={Number(row.overBudget) > 0 ? "over" : ""}
            key={row.id}
          >
            <header>
              <span>{index + 1}</span>
              <div>
                <b>{row.name}</b>
                <small>
                  {row.kind === "STAFF" ? "Staff Salary" : "Other PME Costs"}
                </small>
              </div>
              {Number(row.overBudget) > 0 && <AlertTriangle />}
            </header>
            <dl>
              <div>
                <dt>Budget</dt>
                <dd>{cash(row.currentBudget)}</dd>
              </div>
              <div>
                <dt>Cost to Date</dt>
                <dd>{cash(row.costToDate)}</dd>
              </div>
              <div>
                <dt>Remaining</dt>
                <dd
                  className={Number(row.remainingBudget) < 0 ? "negative" : ""}
                >
                  {cash(row.remainingBudget)}
                </dd>
              </div>
            </dl>
            {canWrite && (
              <button className="table-action" onClick={() => onBudget(row)}>
                Edit Budget
              </button>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
function Kpi({
  label,
  value,
  tone = "",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className={`material-metric ${tone}`}>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function Staff({
  data,
  canWrite,
  onAdd,
  onEdit,
  onOpen,
}: {
  data: Data;
  canWrite: boolean;
  onAdd: () => void;
  onEdit: (e: Employee) => void;
  onOpen: (e: Employee) => void;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [month, setMonth] = useState("");
  const rows = useMemo(
    () =>
      data.employees.filter(
        (e) =>
          (cat === "ALL" || e.categoryId === cat) &&
          (status === "ALL" || e.status === status) &&
          (!month || e.monthlyCosts.some((m) => m.month.startsWith(month))) &&
          `${e.name} ${e.employeeId} ${e.position} ${e.category.name}`
            .toLowerCase()
            .includes(q.toLowerCase()),
      ),
    [data, q, cat, status, month],
  );
  return (
    <>
      <div className="section-heading">
        <div>
          <h3>Staff Salary</h3>
          <p>Employee master records and scalable monthly salary tracking.</p>
        </div>
        {canWrite && (
          <button onClick={onAdd}>
            <Plus />
            Add Employee
          </button>
        )}
      </div>
      <div className="pme-filters">
        <label className="search">
          <Search />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search employee, ID, position or category"
          />
        </label>
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="ALL">All categories</option>
          {data.categories
            .filter((x) => x.kind === "STAFF")
            .map((x) => (
              <option value={x.id} key={x.id}>
                {x.name}
              </option>
            ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="LEFT_PROJECT">Left Project</option>
        </select>
        <input
          aria-label="Filter month"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </div>
      <div className="pme-table">
        <div className="pme-staff-head">
          <span>#</span>
          <span>Employee</span>
          <span>Position</span>
          <span>ID</span>
          <span>Category</span>
          <span>Paid Till Date</span>
          <span>Status</span>
          <span />
        </div>
        {rows.map((e) => (
          <div className="pme-staff-row" key={e.id}>
            <span>{e.employeeNumber}</span>
            <span>
              <b>{e.name}</b>
            </span>
            <span>{e.position}</span>
            <span>{e.employeeId}</span>
            <span>{e.category.name}</span>
            <span>{cash(e.totalPaid)}</span>
            <span>
              <Status value={e.status} />
            </span>
            <span>
              <button className="table-action" onClick={() => onOpen(e)}>
                Open
              </button>
              {canWrite && (
                <button className="table-action" onClick={() => onEdit(e)}>
                  Edit
                </button>
              )}
            </span>
          </div>
        ))}
        {!rows.length && (
          <div className="empty">
            <p>No employees match this view.</p>
          </div>
        )}
      </div>
    </>
  );
}

function Other({
  data,
  canWrite,
  onAdd,
  onEdit,
}: {
  data: Data;
  canWrite: boolean;
  onAdd: () => void;
  onEdit: (r: OtherCost) => void;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const rows = data.otherCosts.filter(
    (r) =>
      (cat === "ALL" || r.categoryId === cat) &&
      (!from || r.transactionDate.slice(0, 10) >= from) &&
      (!to || r.transactionDate.slice(0, 10) <= to) &&
      `${r.item} ${r.poNumber} ${r.category.name}`
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  return (
    <>
      <div className="section-heading">
        <div>
          <h3>Other PME Costs</h3>
          <p>
            Equipment, facilities, tools, PPE, scaffolding, software and
            transportation.
          </p>
        </div>
        {canWrite && (
          <button onClick={onAdd}>
            <Plus />
            Add PME Cost
          </button>
        )}
      </div>
      <div className="pme-filters">
        <label className="search">
          <Search />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search item, PO or category"
          />
        </label>
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="ALL">All categories</option>
          {data.categories
            .filter((x) => x.kind === "OTHER")
            .map((x) => (
              <option value={x.id} key={x.id}>
                {x.name}
              </option>
            ))}
        </select>
        <input
          aria-label="Date from"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <input
          aria-label="Date to"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
      <div className="pme-table">
        <div className="pme-cost-head">
          <span>#</span>
          <span>Item</span>
          <span>PO No.</span>
          <span>Date</span>
          <span>Category</span>
          <span>Amount Paid</span>
          <span>Remarks</span>
          <span>Status</span>
          <span />
        </div>
        {rows.map((r, i) => (
          <div className="pme-cost-row" key={r.id}>
            <span>{i + 1}</span>
            <span>
              <b>{r.item}</b>
            </span>
            <span>{r.poNumber}</span>
            <span>{date(r.transactionDate)}</span>
            <span>{r.category.name}</span>
            <span>{cash(r.amount)}</span>
            <span>{r.remarks || "—"}</span>
            <span>
              <Status value={r.status} />
            </span>
            <span>
              {canWrite && (
                <button className="table-action" onClick={() => onEdit(r)}>
                  Edit
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function BudgetModal({
  projectId,
  row,
  onClose,
  onSaved,
}: {
  projectId: string;
  row: Summary;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await api(`/projects/${projectId}/pme/categories/${row.id}/budget`, {
        method: "PUT",
        body: JSON.stringify({
          budget: f.get("budget"),
          reason: f.get("reason"),
        }),
      });
      onSaved();
    } catch (x) {
      setError((x as Error).message);
    }
  }
  return (
    <Modal title={`Edit ${row.name} Budget`} onClose={onClose} error={error}>
      <form onSubmit={save}>
        <div className="budget-history">
          <span>
            <small>Original Budget</small>
            <b>{cash(row.originalBudget)}</b>
          </span>
          <span>
            <small>Current Approved</small>
            <b>{cash(row.currentBudget)}</b>
          </span>
        </div>
        <label>
          New Approved Budget
          <input
            name="budget"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={row.currentBudget}
          />
        </label>
        <label>
          Reason
          <textarea name="reason" required minLength={5} />
        </label>
        <Footer onClose={onClose} label="Save Budget" />
      </form>
    </Modal>
  );
}
function EmployeeModal({
  projectId,
  categories,
  employee,
  onClose,
  onSaved,
}: {
  projectId: string;
  categories: Category[];
  employee?: Employee;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await api(
        `/projects/${projectId}/pme/employees${employee ? `/${employee.id}` : ""}`,
        {
          method: employee ? "PUT" : "POST",
          body: JSON.stringify({
            employeeNumber: f.get("employeeNumber"),
            position: f.get("position"),
            name: f.get("name"),
            employeeId: f.get("employeeId"),
            categoryId: f.get("categoryId"),
            status: f.get("status"),
            remarks: f.get("remarks") || null,
          }),
        },
      );
      onSaved();
    } catch (x) {
      setError((x as Error).message);
    }
  }
  return (
    <Modal
      title={employee ? "Edit Employee" : "Add Employee"}
      onClose={onClose}
      error={error}
    >
      <form onSubmit={save}>
        <div className="form-grid">
          <Field
            label="Employee No."
            name="employeeNumber"
            type="number"
            min="1"
            required
            value={employee?.employeeNumber}
          />
          <Field
            label="Employee ID"
            name="employeeId"
            required
            value={employee?.employeeId}
          />
          <Field label="Name" name="name" required value={employee?.name} />
          <Field
            label="Position"
            name="position"
            required
            value={employee?.position}
          />
          <label>
            Category
            <select
              name="categoryId"
              defaultValue={employee?.categoryId || ""}
              required
            >
              <option value="" disabled>
                Select category
              </option>
              {categories.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select name="status" defaultValue={employee?.status || "ACTIVE"}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="LEFT_PROJECT">Left Project</option>
            </select>
          </label>
          <label className="full">
            Remarks
            <textarea name="remarks" defaultValue={employee?.remarks} />
          </label>
        </div>
        <Footer onClose={onClose} label="Save Employee" />
      </form>
    </Modal>
  );
}
function EmployeeDrawer({
  employee,
  canWrite,
  onClose,
  onEdit,
  onAddMonth,
  onEditMonth,
}: {
  employee: Employee;
  canWrite: boolean;
  onClose: () => void;
  onEdit: () => void;
  onAddMonth: () => void;
  onEditMonth: (m: Month) => void;
}) {
  return (
    <div className="drawer-bg">
      <aside className="material-drawer">
        <header>
          <div>
            <p className="eyebrow">Staff salary record</p>
            <h2>{employee.name}</h2>
            <small>
              {employee.employeeId} · {employee.position}
            </small>
          </div>
          <button className="icon" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="material-meta">
          <span>
            <small>Employee No.</small>
            <b>{employee.employeeNumber}</b>
          </span>
          <span>
            <small>Category</small>
            <b>{employee.category.name}</b>
          </span>
          <span>
            <small>Status</small>
            <Status value={employee.status} />
          </span>
          <span>
            <small>Paid Till Date</small>
            <b>{cash(employee.totalPaid)}</b>
          </span>
        </div>
        <div className="section-heading">
          <h3>Monthly Salary Records</h3>
          <div className="actions">
            {canWrite && (
              <>
                <button className="secondary" onClick={onEdit}>
                  Edit Employee
                </button>
                <button onClick={onAddMonth}>
                  <Plus />
                  Add Monthly Record
                </button>
              </>
            )}
          </div>
        </div>
        <div className="month-list">
          {employee.monthlyCosts.map((m) => (
            <article key={m.id}>
              <header>
                <b>{month(m.month)}</b>
                {canWrite && (
                  <button
                    className="table-action"
                    onClick={() => onEditMonth(m)}
                  >
                    Edit
                  </button>
                )}
              </header>
              <div>
                <span>
                  <small>Salary</small>
                  <b>{cash(m.salary)}</b>
                </span>
                <span>
                  <small>WPH %</small>
                  <b>{Number(m.wphPercent) * 100}%</b>
                </span>
                <span>
                  <small>Total Amount</small>
                  <b>{cash(m.totalAmount)}</b>
                </span>
              </div>
              <p>{m.remarks || "No remarks"}</p>
            </article>
          ))}
          {!employee.monthlyCosts.length && (
            <div className="empty">
              <p>No monthly salary records yet.</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
function MonthModal({
  projectId,
  employee,
  row,
  onClose,
  onSaved,
}: {
  projectId: string;
  employee: Employee;
  row?: Month;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  const [salary, setSalary] = useState(row?.salary || "0");
  const [wph, setWph] = useState(
    row ? String(Number(row.wphPercent) * 100) : "100",
  );
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await api(
        `/projects/${projectId}/pme/employees/${employee.id}/monthly-costs${row ? `/${row.id}` : ""}`,
        {
          method: row ? "PUT" : "POST",
          body: JSON.stringify({
            month: f.get("month"),
            salary,
            wphPercent: wph,
            remarks: f.get("remarks") || null,
          }),
        },
      );
      onSaved();
    } catch (x) {
      setError((x as Error).message);
    }
  }
  return (
    <Modal
      title={row ? "Edit Monthly Salary" : "Add Monthly Salary"}
      onClose={onClose}
      error={error}
    >
      <form onSubmit={save}>
        <label>
          Month
          <input
            name="month"
            type="month"
            required
            defaultValue={row?.month.slice(0, 7)}
          />
        </label>
        <label>
          Salary
          <input
            type="number"
            min="0"
            step="0.01"
            required
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
          />
        </label>
        <label>
          WPH %
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            required
            value={wph}
            onChange={(e) => setWph(e.target.value)}
          />
        </label>
        <div className="calculated-preview">
          <span>
            <small>Calculated Total Amount</small>
            <b>{cash((Number(salary) * Number(wph)) / 100)}</b>
          </span>
        </div>
        <label>
          Remarks
          <textarea name="remarks" defaultValue={row?.remarks} />
        </label>
        <Footer onClose={onClose} label="Save Monthly Record" />
      </form>
    </Modal>
  );
}
function CostModal({
  projectId,
  categories,
  row,
  onClose,
  onSaved,
}: {
  projectId: string;
  categories: Category[];
  row?: OtherCost;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await api(
        `/projects/${projectId}/pme/other-costs${row ? `/${row.id}` : ""}`,
        {
          method: row ? "PUT" : "POST",
          body: JSON.stringify({
            item: f.get("item"),
            poNumber: f.get("poNumber"),
            transactionDate: f.get("transactionDate"),
            categoryId: f.get("categoryId"),
            amount: f.get("amount"),
            remarks: f.get("remarks") || null,
            status: f.get("status"),
          }),
        },
      );
      onSaved();
    } catch (x) {
      setError((x as Error).message);
    }
  }
  return (
    <Modal
      title={row ? "Edit PME Cost" : "Add PME Cost"}
      onClose={onClose}
      error={error}
    >
      <form onSubmit={save}>
        <div className="form-grid">
          <Field label="Item" name="item" required value={row?.item} />
          <Field
            label="PO No."
            name="poNumber"
            required
            value={row?.poNumber}
          />
          <Field
            label="Date"
            name="transactionDate"
            type="date"
            required
            value={row?.transactionDate.slice(0, 10)}
          />
          <label>
            Category
            <select
              name="categoryId"
              required
              defaultValue={row?.categoryId || ""}
            >
              <option value="" disabled>
                Select category
              </option>
              {categories.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Amount Paid Till Date"
            name="amount"
            type="number"
            min="0"
            step="0.01"
            required
            value={row?.amount}
          />
          <label>
            Status
            <select name="status" defaultValue={row?.status || "OPEN"}>
              <option value="OPEN">Open</option>
              <option value="CLOSED">Closed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </label>
          <label className="full">
            Remarks
            <textarea name="remarks" defaultValue={row?.remarks} />
          </label>
        </div>
        <Footer onClose={onClose} label="Save PME Cost" />
      </form>
    </Modal>
  );
}
function Modal({
  title,
  onClose,
  error,
  children,
}: {
  title: string;
  onClose: () => void;
  error: string;
  children: ReactNode;
}) {
  return (
    <div className="modal-bg">
      <div className="modal small">
        <header>
          <div>
            <p className="eyebrow">PME / Engineering</p>
            <h2>{title}</h2>
          </div>
          <button className="icon" onClick={onClose}>
            <X />
          </button>
        </header>
        {error && <div className="error">{error}</div>}
        {children}
      </div>
    </div>
  );
}
function Footer({ onClose, label }: { onClose: () => void; label: string }) {
  return (
    <footer>
      <button type="button" className="secondary" onClick={onClose}>
        Cancel
      </button>
      <button>{label}</button>
    </footer>
  );
}
function Field({ label, ...props }: any) {
  return (
    <label>
      {label}
      <input {...props} defaultValue={props.value} />
    </label>
  );
}
function Status({ value }: { value: string }) {
  return (
    <span className={`material-status ${value.toLowerCase()}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}
const cash = (v: string | number) =>
  `SAR ${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const date = (v: string) =>
  new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(v));
const month = (v: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(v));
