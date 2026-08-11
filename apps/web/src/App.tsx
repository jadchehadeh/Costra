import {
  useEffect as reactUseEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Routes,
  Route,
  NavLink,
  Navigate,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  ChevronRight,
  ClipboardList,
  FolderKanban,
  GripVertical,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { api, type Project, type User } from "./api";
import BudgetSimple from "./BudgetSimple";
import Materials from "./Materials";
import PurchaseOrders from "./PurchaseOrders";
import ProjectOverview from "./ProjectOverview";
import PmeEngineering from "./PmeEngineering";

const statusLabel: Record<string, string> = {
  PLANNING: "Planning",
  ACTIVE: "Active",
  ON_HOLD: "On Hold",
  COMPLETED: "Completed",
  CLOSED: "Closed",
};
const modules = [
  "Overview",
  "Budget",
  "Materials",
  "PME / Engineering",
  "Manpower",
  "Facilities",
  "Civil Works",
  "Testing & Commissioning",
  "Store",
  "Preliminaries",
  "Spare Parts",
  "Overhead",
  "Purchase Orders",
  "Actual Costs",
  "Forecast",
  "Variations",
  "Cash Flow",
  "Reports",
];
const useEffect = (effect: () => unknown, deps: unknown[]) =>
  reactUseEffect(() => {
    effect();
  }, deps);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!localStorage.getItem("costra_token")) {
      setLoading(false);
      return;
    }
    api<User>("/me")
      .then(setUser)
      .catch(() => localStorage.removeItem("costra_token"))
      .finally(() => setLoading(false));
  }, []);
  if (loading)
    return (
      <div className="center">
        <div className="spinner" />
      </div>
    );
  if (!user) return <Login onLogin={setUser} />;
  return (
    <Shell
      user={user}
      onLogout={() => {
        localStorage.removeItem("costra_token");
        setUser(null);
      }}
    />
  );
}

function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const result = await api<{ token: string; user: User }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      localStorage.setItem("costra_token", result.token);
      onLogin(result.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <section className="login-brand">
        <Brand />
        <div>
          <h1>
            Know Your Cost.
            <br />
            Control Your Project.
          </h1>
          <p>Clarity and control for construction project performance.</p>
        </div>
        <small>Secure project cost-control workspace</small>
      </section>
      <section className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <p className="eyebrow">Welcome back</p>
          <h2>Sign in to COSTRA</h2>
          <p className="muted">Enter your work account to continue.</p>
          {error && <div className="error">{error}</div>}
          <label>
            Email address
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="name@company.com"
              defaultValue="manager@costra.local"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              defaultValue="ChangeMe123!"
            />
          </label>
          <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          <p className="security">
            <ShieldCheck size={16} /> Protected access · Authorized users only
          </p>
        </form>
      </section>
    </main>
  );
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-logo-frame">
        <img src="/mab-logo.jpeg" alt="MAB" />
      </span>
      <span>
        <b>COSTRA</b>
        <small>COST CONTROL</small>
      </span>
    </div>
  );
}
function Shell({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="app">
      <aside className={open ? "sidebar open" : "sidebar"}>
        <div className="side-head">
          <Brand />
          <button className="icon mobile" onClick={() => setOpen(false)}>
            <X />
          </button>
        </div>
        <nav>
          <NavItem to="/dashboard" icon={<BarChart3 />}>
            Dashboard
          </NavItem>
          <NavItem to="/projects" icon={<FolderKanban />}>
            Projects
          </NavItem>
          <NavItem to="/reports" icon={<ClipboardList />}>
            Reports
          </NavItem>
          {(user.permissions.includes("settings.manage") ||
            user.permissions.includes("users.manage")) && (
            <NavItem to="/settings" icon={<SettingsIcon />}>
              Settings
            </NavItem>
          )}
        </nav>
        <div className="creator-credit">
          <span>Designed &amp; developed by</span>
          <b>Jad Chehade</b>
        </div>
        <div className="user-card">
          <span className="avatar">
            {user.name
              .split(" ")
              .map((x) => x[0])
              .slice(0, 2)}
          </span>
          <div>
            <b>{user.name}</b>
            <small>{user.role}</small>
          </div>
          <button className="icon" title="Sign out" onClick={onLogout}>
            <LogOut />
          </button>
        </div>
      </aside>
      <main className="content">
        <header className="topbar">
          <button className="icon mobile" onClick={() => setOpen(true)}>
            <Menu />
          </button>
          <div className="crumb">
            COSTRA <ChevronRight /> <span>Workspace</span>
          </div>
          <span className="environment">LIVE WORKSPACE</span>
        </header>
        <div className="page">
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route
              path="/projects"
              element={
                <Projects
                  canWrite={user.permissions.includes("projects.write")}
                />
              }
            />
            <Route path="/projects/:id/*" element={<ProjectDetail />} />
            <Route
              path="/reports"
              element={
                <Placeholder
                  title="Reports"
                  text="Project and executive reporting will be introduced with the financial modules."
                />
              }
            />
            <Route path="/settings" element={<Settings user={user} />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
function NavItem({
  to,
  icon,
  children,
}: {
  to: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <NavLink to={to} onClick={() => {}}>
      {icon}
      <span>{children}</span>
    </NavLink>
  );
}

function Dashboard() {
  const [data, setData] = useState<any>();
  useEffect(() => {
    api("/dashboard").then(setData);
  }, []);
  const cards = [
    ["Total Projects", data?.totalProjects ?? "—", "Projects registered"],
    ["Total Budget", "—", "Awaiting budget module"],
    ["Total Committed", "—", "Awaiting commitments"],
    ["Actual Cost", "—", "Awaiting cost records"],
    ["Forecast Final Cost", "—", "Awaiting forecasts"],
    ["Forecast Variance", "—", "Awaiting forecasts"],
    [
      "Projects At Risk",
      data?.projectsAtRisk ?? "—",
      "Based on project status",
    ],
  ];
  return (
    <>
      <PageTitle
        kicker="Portfolio overview"
        title="Dashboard"
        description="A clear view of your project portfolio and items requiring attention."
      />
      <div className="metric-grid">
        {cards.map(([a, b, c], i) => (
          <article className="metric" key={a}>
            <div className={i === 6 ? "metric-icon warn" : "metric-icon"}>
              {i === 6 ? <AlertTriangle /> : <BarChart3 />}
            </div>
            <p>{a}</p>
            <strong>{b}</strong>
            <small>{c}</small>
          </article>
        ))}
      </div>
      <section className="panel empty">
        <Building2 />
        <h3>Your cost-control overview starts here</h3>
        <p>
          Financial metrics will populate when approved modules and real project
          records are introduced.
        </p>
      </section>
    </>
  );
}

function Projects({ canWrite }: { canWrite: boolean }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [show, setShow] = useState(false);
  const load = () =>
    api<Project[]>(
      `/projects?q=${encodeURIComponent(q)}&status=${status}`,
    ).then(setProjects);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [q, status]);
  return (
    <>
      <PageTitle
        kicker="Project control"
        title="Projects"
        description="Manage the projects under your cost-control responsibility."
        action={
          canWrite ? (
            <button onClick={() => setShow(true)}>
              <Plus /> Create project
            </button>
          ) : undefined
        }
      />
      <div className="toolbar">
        <label className="search">
          <Search />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, number or client"
          />
        </label>
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="ALL">All statuses</option>
          {Object.entries(statusLabel).map(([k, v]) => (
            <option value={k} key={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Client</th>
              <th>Status</th>
              <th>Dates</th>
              <th>Budget</th>
              <th>Forecast</th>
              <th>Health</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td>
                  <b>{p.name}</b>
                  <small>{p.number}</small>
                </td>
                <td>{p.client}</td>
                <td>
                  <Status value={p.status} />
                </td>
                <td>
                  <small>
                    {date(p.startDate)} — {date(p.plannedCompletionDate)}
                  </small>
                </td>
                <td className="muted">Not loaded</td>
                <td className="muted">Not available</td>
                <td>
                  <span className="health">Not assessed</span>
                </td>
                <td>
                  <NavLink className="open-link" to={`/projects/${p.id}`}>
                    Open <ChevronRight />
                  </NavLink>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {projects.length === 0 && (
          <div className="empty compact">
            <FolderKanban />
            <h3>No projects found</h3>
            <p>
              {q || status !== "ALL"
                ? "Try adjusting your search or filter."
                : "Create the first project to establish its cost-control workspace."}
            </p>
          </div>
        )}
      </div>
      {show && (
        <ProjectModal
          onClose={() => setShow(false)}
          onSaved={() => {
            setShow(false);
            load();
          }}
        />
      )}
    </>
  );
}

function ProjectModal({
  onClose,
  onSaved,
  project,
}: {
  onClose: () => void;
  onSaved: () => void;
  project?: Project;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [packages, setPackages] = useState(
    project?.packages?.map((row) => ({ ...row })) || [],
  );
  const [packageName, setPackageName] = useState("");
  const [draggedPackage, setDraggedPackage] = useState<number>();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const value = Object.fromEntries(f);
    if (value.contractValue)
      value.contractValue = Number(value.contractValue) as any;
    value.packages = packages as any;
    try {
      await api(project ? `/projects/${project.id}` : "/projects", {
        method: project ? "PUT" : "POST",
        body: JSON.stringify(value),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="modal-bg">
      <form className="modal" onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">Project record</p>
            <h2>{project ? "Edit project" : "Create a project"}</h2>
          </div>
          <button type="button" className="icon" onClick={onClose}>
            <X />
          </button>
        </header>
        {error && <div className="error">{error}</div>}
        <div className="form-grid">
          <Field
            label="Project Name"
            name="name"
            required
            value={project?.name}
          />
          <Field
            label="Project Number"
            name="number"
            required
            value={project?.number}
          />
          <Field
            label="Client"
            name="client"
            required
            value={project?.client}
          />
          <Field
            label="Project Type"
            name="projectType"
            value={project?.projectType}
          />
          <Field label="Location" name="location" value={project?.location} />
          <Field
            label="Contract Value"
            name="contractValue"
            type="number"
            min="0"
            step="0.01"
            value={project?.contractValue}
          />
          <label>
            Currency
            <select name="currency" defaultValue={project?.currency || "SAR"}>
              <option>SAR</option>
              <option>USD</option>
              <option>AED</option>
              <option>EUR</option>
            </select>
          </label>
          <label>
            Status
            <select name="status" defaultValue={project?.status || "PLANNING"}>
              {Object.entries(statusLabel).map(([k, v]) => (
                <option value={k} key={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Start Date"
            name="startDate"
            type="date"
            value={project?.startDate?.slice(0, 10)}
          />
          <Field
            label="Planned Completion"
            name="plannedCompletionDate"
            type="date"
            value={project?.plannedCompletionDate?.slice(0, 10)}
          />
          <label className="full">
            Description
            <textarea name="description" defaultValue={project?.description} />
          </label>
          <section className="project-packages full">
            <div>
              <b>Packages</b>
              <small>
                Drag to reorder. Packages are available only in this project.
              </small>
            </div>
            <div className="package-rows">
              {packages.map((row, index) => (
                <div
                  className={`package-row${row.active ? "" : " inactive"}`}
                  key={row.id || index}
                  draggable
                  onDragStart={() => setDraggedPackage(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (
                      draggedPackage === undefined ||
                      draggedPackage === index
                    )
                      return;
                    setPackages((current) => {
                      const next = [...current];
                      const [moved] = next.splice(draggedPackage, 1);
                      next.splice(index, 0, moved);
                      return next;
                    });
                    setDraggedPackage(undefined);
                  }}
                >
                  <GripVertical />
                  <input
                    aria-label={`Package ${index + 1} name`}
                    value={row.name}
                    onChange={(event) =>
                      setPackages((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, name: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="table-action"
                    onClick={() =>
                      setPackages((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, active: !item.active }
                            : item,
                        ),
                      )
                    }
                  >
                    {row.active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              ))}
            </div>
            <div className="package-add">
              <input
                value={packageName}
                onChange={(event) => setPackageName(event.target.value)}
                placeholder="Package name"
              />
              <button
                type="button"
                className="secondary"
                disabled={!packageName.trim()}
                onClick={() => {
                  setPackages((current) => [
                    ...current,
                    { name: packageName.trim(), active: true },
                  ]);
                  setPackageName("");
                }}
              >
                <Plus /> Add Package
              </button>
            </div>
          </section>
        </div>
        <footer>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button disabled={busy}>{busy ? "Saving…" : "Save project"}</button>
        </footer>
      </form>
    </div>
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

function ProjectDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [project, setProject] = useState<Project>();
  const [active, setActive] = useState("Overview");
  const [edit, setEdit] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const permissions =
    JSON.parse(
      atob(
        (localStorage.getItem("costra_token") || "..").split(".")[1] || "e30=",
      ),
    ).permissions ?? [];
  const canWrite = permissions.includes("financial.write");
  const canManageProject = permissions.includes("projects.write");
  async function deleteProject() {
    await api(`/projects/${id}`, { method: "DELETE" });
    nav("/projects");
  }
  useEffect(() => {
    api<Project>(`/projects/${id}`)
      .then(setProject)
      .catch(() => nav("/projects"));
  }, [id]);
  if (!project)
    return (
      <div className="center">
        <div className="spinner" />
      </div>
    );
  return (
    <>
      <div className="project-heading">
        <button className="back" onClick={() => nav("/projects")}>
          ← Projects
        </button>
        <div>
          <div>
            <Status value={project.status} />
            <span className="project-number">{project.number}</span>
          </div>
          <h1>{project.name}</h1>
          <p>
            {project.client}
            {project.location ? ` · ${project.location}` : ""}
          </p>
        </div>
        {canManageProject && (
          <div className="actions">
            <button className="secondary" onClick={() => setEdit(true)}>
              Edit Project
            </button>
            <button
              className="danger-button"
              onClick={() => setDeleteOpen(true)}
            >
              Delete Project
            </button>
          </div>
        )}
      </div>
      <div className="project-layout">
        <aside className="module-nav">
          {modules.map((m) => (
            <button
              className={active === m ? "active" : ""}
              onClick={() => setActive(m)}
              key={m}
            >
              {m}
            </button>
          ))}
        </aside>
        <section className="module-content">
          {active === "Overview" ? (
            <ProjectOverview project={project} onOpen={setActive} />
          ) : active === "Budget" ? (
            <BudgetSimple projectId={project.id} canWrite={canWrite} />
          ) : active === "Materials" ? (
            <Materials
              projectId={project.id}
              canWrite={canWrite}
              onOpenBudget={() => setActive("Budget")}
            />
          ) : active === "Purchase Orders" ? (
            <PurchaseOrders
              projectId={project.id}
              onOpenMaterials={() => setActive("Materials")}
            />
          ) : active === "PME / Engineering" ? (
            <PmeEngineering projectId={project.id} canWrite={canWrite} />
          ) : (
            <Placeholder
              title={active}
              text="This module is prepared in the project workspace. Its records and calculations will be designed against the approved business workflow before implementation."
            />
          )}
        </section>
      </div>
      {edit && (
        <ProjectModal
          project={project}
          onClose={() => setEdit(false)}
          onSaved={() => {
            setEdit(false);
            api<Project>(`/projects/${id}`).then(setProject);
          }}
        />
      )}
      {deleteOpen && (
        <DeleteProjectDialog
          project={project}
          onClose={() => setDeleteOpen(false)}
          onConfirm={deleteProject}
        />
      )}
    </>
  );
}
function DeleteProjectDialog({
  project,
  onClose,
  onConfirm,
}: {
  project: Project;
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
      aria-labelledby="delete-project-title"
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
        <h2 id="delete-project-title">Delete project?</h2>
        <p>
          You are about to remove <b>{project.name}</b> from active project
          views.
        </p>
        <div className="delete-warning">
          <b>Financial records will not be erased.</b>
          <span>
            Budget items, revisions, reallocations, and audit history are
            retained for governance and recovery.
          </span>
        </div>
        {error && <div className="error">{error}</div>}
        <label>
          Type <b>{project.name}</b> to confirm
          <input
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoFocus
            autoComplete="off"
          />
        </label>
        <footer>
          <button className="secondary" onClick={onClose} disabled={busy}>
            Keep Project
          </button>
          <button
            className="danger-confirm"
            disabled={confirmation !== project.name || busy}
            onClick={() => void remove()}
          >
            {busy ? "Deleting…" : "Delete Project"}
          </button>
        </footer>
      </div>
    </div>
  );
}
type Category = {
  id: string;
  name: string;
  code: string;
  active: boolean;
  displayOrder: number;
  costCodes: Array<{ id: string; code: string; name: string; active: boolean }>;
};
type BudgetItem = {
  id: string;
  categoryId: string;
  costCodeId: string;
  description: string;
  originalBudget: string;
  currentApprovedBudget: string;
  approvedChange: string;
  currency: string;
  unit?: string;
  quantity?: string;
  unitRate?: string;
  notes?: string;
  active: boolean;
  category: { name: string };
  costCode: { code: string; name: string };
};
type BudgetData = {
  summary: {
    originalBudget: string;
    currentApprovedBudget: string;
    approvedChanges: string;
    categoryCount: number;
    itemCount: number;
    currency: string;
  };
  categories: Category[];
  categorySummary: Array<{
    id: string;
    name: string;
    code: string;
    itemCount: number;
    currentApprovedBudget: string;
  }>;
  items: BudgetItem[];
};
function BudgetScreen({
  projectId,
  canWrite,
}: {
  projectId: string;
  canWrite: boolean;
}) {
  const [data, setData] = useState<BudgetData>();
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("ALL");
  const [status, setStatus] = useState("ACTIVE");
  const [sort, setSort] = useState("code");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [modal, setModal] = useState<"item" | "structure" | "import" | null>(
    null,
  );
  const [editing, setEditing] = useState<BudgetItem>();
  const load = () =>
    api<BudgetData>(`/projects/${projectId}/budget`)
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(load, [projectId]);
  if (error) return <div className="error">{error}</div>;
  if (!data)
    return (
      <div className="center">
        <div className="spinner" />
      </div>
    );
  const rows = data.items
    .filter(
      (i) =>
        (status === "ALL" || (status === "ACTIVE") === i.active) &&
        (category === "ALL" || i.categoryId === category) &&
        `${i.costCode.code} ${i.description} ${i.category.name}`
          .toLowerCase()
          .includes(q.toLowerCase()) &&
        (!min || Number(i.currentApprovedBudget) >= Number(min)) &&
        (!max || Number(i.currentApprovedBudget) <= Number(max)),
    )
    .sort((a, b) =>
      sort === "description"
        ? a.description.localeCompare(b.description)
        : sort === "original"
          ? Number(a.originalBudget) - Number(b.originalBudget)
          : sort === "current"
            ? Number(a.currentApprovedBudget) - Number(b.currentApprovedBudget)
            : a.costCode.code.localeCompare(b.costCode.code),
    );
  return (
    <div className="budget">
      <div className="budget-title">
        <div>
          <p className="eyebrow">Project budget</p>
          <h2>Budget &amp; Cost Structure</h2>
          <p className="muted">
            Approved budget baseline, cost codes and controlled revisions.
          </p>
        </div>
        {canWrite && (
          <div className="actions">
            <button className="secondary" onClick={() => setModal("import")}>
              <Upload /> Import
            </button>
            <button className="secondary" onClick={() => setModal("structure")}>
              Manage structure
            </button>
            <button
              onClick={() => {
                setEditing(undefined);
                setModal("item");
              }}
            >
              <Plus /> Add budget item
            </button>
          </div>
        )}
      </div>
      <div className="budget-kpis">
        <BudgetKpi
          label="Original Budget"
          value={cash(data.summary.originalBudget, data.summary.currency)}
        />
        <BudgetKpi
          label="Current Approved"
          value={cash(
            data.summary.currentApprovedBudget,
            data.summary.currency,
          )}
        />
        <BudgetKpi
          label="Approved Changes"
          value={signedCash(
            data.summary.approvedChanges,
            data.summary.currency,
          )}
        />
        <BudgetKpi
          label="Cost Categories"
          value={String(data.summary.categoryCount)}
        />
        <BudgetKpi
          label="Budget Items"
          value={String(data.summary.itemCount)}
        />
      </div>
      <div className="future-strip">
        <span>
          <b>Commitments</b> —
        </span>
        <span>
          <b>Actual</b> —
        </span>
        <span>
          <b>Forecast</b> —
        </span>
        <span>
          <b>Variance</b> —
        </span>
      </div>
      {data.categorySummary.length > 0 && (
        <div className="category-summary">
          {data.categorySummary.map((c) => (
            <article key={c.id}>
              <small>{c.code}</small>
              <b>{c.name}</b>
              <strong>
                {cash(c.currentApprovedBudget, data.summary.currency)}
              </strong>
              <span>
                {c.itemCount} item{c.itemCount === 1 ? "" : "s"}
              </span>
            </article>
          ))}
        </div>
      )}
      <div className="budget-tools">
        <label className="search">
          <Search />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search code, description or category"
          />
        </label>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="ALL">All categories</option>
          {data.categories.map((c) => (
            <option value={c.id} key={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="ALL">All statuses</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="code">Sort: Code</option>
          <option value="description">Sort: Description</option>
          <option value="original">Sort: Original</option>
          <option value="current">Sort: Current</option>
        </select>
        <input
          className="range"
          type="number"
          min="0"
          placeholder="Min budget"
          value={min}
          onChange={(e) => setMin(e.target.value)}
        />
        <input
          className="range"
          type="number"
          min="0"
          placeholder="Max budget"
          value={max}
          onChange={(e) => setMax(e.target.value)}
        />
      </div>
      <div className="table-wrap budget-table">
        <table>
          <thead>
            <tr>
              <th>Cost Code</th>
              <th>Category</th>
              <th>Description</th>
              <th className="right">Original</th>
              <th className="right">Current Approved</th>
              <th className="right">Approved Change</th>
              <th>Currency</th>
              <th>Status</th>
              {canWrite && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id}>
                <td>
                  <b>{i.costCode.code}</b>
                </td>
                <td>{i.category.name}</td>
                <td>{i.description}</td>
                <td className="right money">{amount(i.originalBudget)}</td>
                <td className="right money">
                  <b>{amount(i.currentApprovedBudget)}</b>
                </td>
                <td
                  className={`right money ${Number(i.approvedChange) !== 0 ? "changed" : ""}`}
                >
                  {signed(i.approvedChange)}
                </td>
                <td>{i.currency}</td>
                <td>
                  <span className={i.active ? "status s-active" : "status"}>
                    <i />
                    {i.active ? "Active" : "Inactive"}
                  </span>
                </td>
                {canWrite && (
                  <td>
                    <button
                      className="table-action"
                      onClick={() => {
                        setEditing(i);
                        setModal("item");
                      }}
                    >
                      Edit
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="empty compact">
            <ClipboardList />
            <h3>No budget items found</h3>
            <p>
              {data.items.length
                ? "Adjust the filters to see more items."
                : "Create categories and cost codes, then add the first approved budget item."}
            </p>
          </div>
        )}
      </div>
      <div className="budget-total">
        <span>Total project budget</span>
        <strong>
          {cash(data.summary.currentApprovedBudget, data.summary.currency)}
        </strong>
      </div>
      {modal === "structure" && (
        <StructureModal
          projectId={projectId}
          categories={data.categories}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
      {modal === "item" && (
        <BudgetItemModal
          projectId={projectId}
          categories={data.categories}
          item={editing}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
      {modal === "import" && <ImportModal onClose={() => setModal(null)} />}
    </div>
  );
}
function BudgetKpi({ label, value }: { label: string; value: string }) {
  return (
    <article>
      <small>{label}</small>
      <strong>{value}</strong>
    </article>
  );
}
function StructureModal({
  projectId,
  categories,
  onClose,
  onSaved,
}: {
  projectId: string;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<"category" | "code">("category");
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api(
        `/projects/${projectId}/${mode === "category" ? "categories" : "cost-codes"}`,
        {
          method: "POST",
          body: JSON.stringify({
            ...values,
            displayOrder: Number(values.displayOrder || 0),
            active: true,
          }),
        },
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="modal-bg">
      <form className="modal small" onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">Cost structure</p>
            <h2>Add {mode === "category" ? "category" : "cost code"}</h2>
          </div>
          <button type="button" className="icon" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="tabs">
          <button
            type="button"
            className={mode === "category" ? "active" : ""}
            onClick={() => setMode("category")}
          >
            Category
          </button>
          <button
            type="button"
            className={mode === "code" ? "active" : ""}
            onClick={() => setMode("code")}
          >
            Cost code
          </button>
        </div>
        {error && <div className="error">{error}</div>}
        <div className="form-grid one">
          {mode === "code" && (
            <label>
              Category
              <select name="categoryId" required>
                <option value="">Select category</option>
                {categories
                  .filter((c) => c.active)
                  .map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <Field
            label={mode === "category" ? "Category Code" : "Cost Code"}
            name="code"
            required
          />
          <Field label="Name" name="name" required />
          <Field
            label="Display Order"
            name="displayOrder"
            type="number"
            min="0"
            value="0"
          />
          <label>
            Description
            <textarea name="description" />
          </label>
        </div>
        <footer>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button>Save</button>
        </footer>
      </form>
    </div>
  );
}
function BudgetItemModal({
  projectId,
  categories,
  item,
  onClose,
  onSaved,
}: {
  projectId: string;
  categories: Category[];
  item?: BudgetItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [categoryId, setCategoryId] = useState(item?.categoryId || "");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(false);
  const category = categories.find((c) => c.id === categoryId);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const values: any = Object.fromEntries(f);
    values.active = values.active === "true";
    ["originalBudget", "quantity", "unitRate"].forEach((k) => {
      if (!values[k]) delete values[k];
    });
    try {
      if (item && revision)
        await api(`/projects/${projectId}/budget-items/${item.id}/revisions`, {
          method: "POST",
          body: JSON.stringify({
            amount: values.changeAmount,
            reason: values.reason,
          }),
        });
      else
        await api(
          item
            ? `/projects/${projectId}/budget-items/${item.id}`
            : `/projects/${projectId}/budget-items`,
          { method: item ? "PUT" : "POST", body: JSON.stringify(values) },
        );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="modal-bg">
      <form className="modal" onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">Approved budget</p>
            <h2>
              {revision
                ? "Revise current budget"
                : item
                  ? "Edit budget item"
                  : "Add budget item"}
            </h2>
          </div>
          <button type="button" className="icon" onClick={onClose}>
            <X />
          </button>
        </header>
        {item && (
          <div className="tabs">
            <button
              type="button"
              className={!revision ? "active" : ""}
              onClick={() => setRevision(false)}
            >
              Item details
            </button>
            <button
              type="button"
              className={revision ? "active" : ""}
              onClick={() => setRevision(true)}
            >
              Approved change
            </button>
          </div>
        )}
        {error && <div className="error">{error}</div>}
        {revision ? (
          <div className="form-grid one">
            <div className="locked">
              <small>Original budget</small>
              <b>{cash(item!.originalBudget, item!.currency)}</b>
              <small>Current approved</small>
              <b>{cash(item!.currentApprovedBudget, item!.currency)}</b>
            </div>
            <Field
              label="Change Amount (+ increase / − decrease)"
              name="changeAmount"
              type="number"
              step="0.01"
              required
            />
            <label>
              Reason
              <textarea name="reason" required minLength={5} />
            </label>
          </div>
        ) : (
          <div className="form-grid">
            <label>
              Category
              <select
                name="categoryId"
                required
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">Select category</option>
                {categories
                  .filter((c) => c.active || c.id === item?.categoryId)
                  .map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Cost Code
              <select
                name="costCodeId"
                required
                defaultValue={item?.costCodeId || ""}
              >
                <option value="">Select cost code</option>
                {category?.costCodes
                  .filter((c) => c.active || c.id === item?.costCodeId)
                  .map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="full">
              Description
              <input
                name="description"
                required
                defaultValue={item?.description}
              />
            </label>
            {!item && (
              <Field
                label="Original Budget (or use quantity × rate)"
                name="originalBudget"
                type="number"
                min="0"
                step="0.01"
              />
            )}
            <label>
              Currency
              <select name="currency" defaultValue={item?.currency || "SAR"}>
                <option>SAR</option>
                <option>USD</option>
                <option>AED</option>
                <option>EUR</option>
              </select>
            </label>
            <Field label="Unit" name="unit" value={item?.unit} />
            <Field
              label="Quantity"
              name="quantity"
              type="number"
              min="0"
              step="0.0001"
              value={item?.quantity}
            />
            <Field
              label="Unit Rate"
              name="unitRate"
              type="number"
              min="0"
              step="0.0001"
              value={item?.unitRate}
            />
            {item && (
              <label>
                Status
                <select name="active" defaultValue={String(item.active)}>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </label>
            )}
            <label className="full">
              Notes
              <textarea name="notes" defaultValue={item?.notes} />
            </label>
          </div>
        )}
        <footer>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button>
            {revision ? "Record approved change" : "Save budget item"}
          </button>
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
          <div>
            <p className="eyebrow">Excel import</p>
            <h2>Import project budget</h2>
          </div>
          <button className="icon" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="import-steps">
          <span className="active">1 Upload</span>
          <span>2 Map</span>
          <span>3 Validate</span>
          <span>4 Import</span>
        </div>
        <div className="empty import">
          <Upload />
          <h3>Excel parser is the next step</h3>
          <p>
            The staged service boundary is ready, but workbook parsing is not
            enabled. No file can be imported or silently accepted in this
            release.
          </p>
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
function Settings({ user }: { user: User }) {
  return (
    <>
      <PageTitle
        kicker="Administration"
        title="Settings"
        description="Single-company application configuration and access control."
      />
      <div className="settings-grid">
        <article className="panel">
          <h3>Company profile</h3>
          <p className="muted">
            Company identity and default application settings are stored
            centrally.
          </p>
          <dl>
            <dt>Application</dt>
            <dd>COSTRA</dd>
            <dt>Deployment</dt>
            <dd>Single company</dd>
            <dt>Default currency</dt>
            <dd>SAR</dd>
          </dl>
        </article>
        <article className="panel">
          <h3>Access model</h3>
          <p className="muted">
            Your current role is <b>{user.role}</b>.
          </p>
          <div className="role-row">
            <span>System Administrator</span>
            <small>Users and configuration</small>
          </div>
          <div className="role-row">
            <span>Cost Control Manager</span>
            <small>Operational control</small>
          </div>
          <div className="role-row">
            <span>Board / Executive</span>
            <small>Read only</small>
          </div>
        </article>
      </div>
    </>
  );
}

function PageTitle({
  kicker,
  title,
  description,
  action,
}: {
  kicker: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <p className="eyebrow">{kicker}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function Placeholder({ title, text }: { title: string; text: string }) {
  return (
    <section className="panel empty">
      <ClipboardList />
      <h2>{title}</h2>
      <p>{text}</p>
      <span className="coming">PLANNED MODULE</span>
    </section>
  );
}
function Status({ value }: { value: string }) {
  return (
    <span className={`status s-${value.toLowerCase()}`}>
      <i />
      {statusLabel[value] || value}
    </span>
  );
}
function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="detail">
      <small>{label}</small>
      <b>{value || "Not entered"}</b>
    </div>
  );
}
const date = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(value))
    : "Not set";
const amount = (value: string) =>
  Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const cash = (value: string, currency: string) =>
  `${currency} ${amount(value)}`;
const signed = (value: string) =>
  `${Number(value) > 0 ? "+" : ""}${amount(value)}`;
const signedCash = (value: string, currency: string) =>
  `${Number(value) > 0 ? "+" : ""}${currency} ${amount(value)}`;
