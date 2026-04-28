/* Programme / Gantt chart screen — desktop */

const PROJECT = {
  name: "42 Smith St, Richmond",
  builder: "Smith Building Co",
  contract: 497500,
  start: "2026-01-06",
  plannedEnd: "2026-11-15",
  currentEnd: "2026-11-25",
  progress: 47,
  phases: [
    { id: "p1", name: "Site establishment", color: "var(--phase-2)", progress: 100 },
    { id: "p2", name: "Earthworks", color: "var(--phase-3)", progress: 100 },
    { id: "p3", name: "Slab", color: "var(--phase-1)", progress: 90 },
    { id: "p4", name: "Framing", color: "var(--phase-4)", progress: 30 },
    { id: "p5", name: "Lock-up", color: "var(--phase-5)", progress: 0 },
    { id: "p6", name: "Fit-out", color: "var(--phase-6)", progress: 0 },
  ],
};

// Tasks: each has phase, name, trade, plannedStart, plannedDays, actualStart, actualDays, progress, dependsOn, milestone, critical
const TASKS = [
  // Site establishment
  { id: "t1", phase: "p1", name: "Site fencing & sheds", trade: "Carpenter", ps: 0, pd: 3, as: 0, ad: 3, progress: 100 },
  { id: "t2", phase: "p1", name: "Service connections", trade: "Plumber", ps: 2, pd: 4, as: 2, ad: 4, progress: 100 },
  { id: "t3", phase: "p1", name: "Site survey", trade: "Surveyor", ps: 0, pd: 2, as: 0, ad: 2, progress: 100, milestone: false },
  // Earthworks
  { id: "t4", phase: "p2", name: "Strip topsoil", trade: "Excavator", ps: 6, pd: 3, as: 6, ad: 3, progress: 100 },
  { id: "t5", phase: "p2", name: "Excavate to RL", trade: "Excavator", ps: 9, pd: 4, as: 9, ad: 5, progress: 100 },
  { id: "t6", phase: "p2", name: "Compaction test", trade: "Engineer", ps: 13, pd: 1, as: 14, ad: 1, progress: 100, milestone: true },
  // Slab
  { id: "t7", phase: "p3", name: "Set out & formwork", trade: "Concreter", ps: 14, pd: 4, as: 15, ad: 4, progress: 100, critical: true },
  { id: "t8", phase: "p3", name: "Plumbing under slab", trade: "Plumber", ps: 17, pd: 3, as: 18, ad: 3, progress: 100, critical: true },
  { id: "t9", phase: "p3", name: "Reo & mesh", trade: "Steel fixer", ps: 20, pd: 3, as: 21, ad: 3, progress: 100, critical: true },
  { id: "t10", phase: "p3", name: "Pour slab — section 1", trade: "Concreter", ps: 23, pd: 1, as: 24, ad: 1, progress: 100, milestone: true, critical: true },
  { id: "t11", phase: "p3", name: "Pour slab — section 2", trade: "Concreter", ps: 24, pd: 1, as: 26, ad: 2, progress: 90, critical: true },
  { id: "t12", phase: "p3", name: "Slab cure", trade: "—", ps: 25, pd: 7, as: 28, ad: 7, progress: 80 },
  // Framing
  { id: "t13", phase: "p4", name: "Wall framing — GF", trade: "Carpenter", ps: 32, pd: 8, as: 35, ad: 8, progress: 65, critical: true },
  { id: "t14", phase: "p4", name: "Wall framing — FF", trade: "Carpenter", ps: 40, pd: 8, as: 43, ad: 0, progress: 25, critical: true },
  { id: "t15", phase: "p4", name: "Roof trusses", trade: "Carpenter", ps: 48, pd: 5, as: 51, ad: 0, progress: 0, critical: true },
  { id: "t16", phase: "p4", name: "Roof battens", trade: "Carpenter", ps: 53, pd: 3, as: 0, ad: 0, progress: 0 },
  { id: "t17", phase: "p4", name: "Frame inspection", trade: "Inspector", ps: 56, pd: 1, as: 0, ad: 0, progress: 0, milestone: true, critical: true },
  // Lock-up
  { id: "t18", phase: "p5", name: "Roof cover", trade: "Roofer", ps: 57, pd: 4, as: 0, ad: 0, progress: 0 },
  { id: "t19", phase: "p5", name: "Windows & doors", trade: "Glazier", ps: 60, pd: 5, as: 0, ad: 0, progress: 0, critical: true },
  { id: "t20", phase: "p5", name: "External cladding", trade: "Carpenter", ps: 65, pd: 8, as: 0, ad: 0, progress: 0 },
  { id: "t21", phase: "p5", name: "Lock-up milestone", trade: "—", ps: 73, pd: 1, as: 0, ad: 0, progress: 0, milestone: true, critical: true },
  // Fit-out
  { id: "t22", phase: "p6", name: "Plumbing rough-in", trade: "Plumber", ps: 60, pd: 6, as: 0, ad: 0, progress: 0 },
  { id: "t23", phase: "p6", name: "Electrical rough-in", trade: "Electrician", ps: 62, pd: 6, as: 0, ad: 0, progress: 0 },
  { id: "t24", phase: "p6", name: "Insulation", trade: "Insulator", ps: 68, pd: 3, as: 0, ad: 0, progress: 0 },
  { id: "t25", phase: "p6", name: "Plasterboard", trade: "Plasterer", ps: 71, pd: 8, as: 0, ad: 0, progress: 0 },
  { id: "t26", phase: "p6", name: "Internal fit-off", trade: "Carpenter", ps: 79, pd: 10, as: 0, ad: 0, progress: 0 },
];

// Project window: 100 days for layout
const PROJECT_DAYS = 100;
const TODAY_DAY = 47;

// Months for the timeline header
const MONTHS = [
  { name: "Jan", days: 13 },
  { name: "Feb", days: 14 },
  { name: "Mar", days: 14 },
  { name: "Apr", days: 14 },
  { name: "May", days: 15 },
  { name: "Jun", days: 14 },
  { name: "Jul", days: 16 },
];

const phaseById = (id) => PROJECT.phases.find((p) => p.id === id);

const Avatar = ({ initials, color = "var(--accent)" }) => (
  <span style={{
    width: 22, height: 22, borderRadius: "50%",
    background: color, color: "#fff",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    fontSize: 10, fontWeight: 600, letterSpacing: "-0.02em",
    border: "2px solid var(--surface)",
  }}>{initials}</span>
);

const ProgressBar = ({ value, height = 4, color = "var(--accent)" }) => (
  <div style={{ width: "100%", height, background: "var(--surface-2)", borderRadius: 999, overflow: "hidden" }}>
    <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 999 }} />
  </div>
);

// ==================================================
// TopBar
// ==================================================
const TopBar = () => (
  <div style={{
    display: "flex", alignItems: "center", height: 44, padding: "0 16px",
    borderBottom: "1px solid var(--border)", background: "var(--surface)",
    gap: 16,
  }}>
    <Wordmark size={14} variant="stack" />
    <div style={{ width: 1, height: 18, background: "var(--border)" }} />
    <nav style={{ display: "flex", gap: 2 }}>
      {["Projects", "Templates", "Reports"].map((l, i) => (
        <a key={l} style={{
          padding: "6px 10px", fontSize: 12.5, fontWeight: 500,
          color: i === 0 ? "var(--ink)" : "var(--ink-3)",
          borderRadius: 6, background: i === 0 ? "var(--surface-2)" : "transparent",
          textDecoration: "none", cursor: "pointer",
        }}>{l}</a>
      ))}
    </nav>
    <div style={{ flex: 1 }} />
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "0 10px", height: 28, borderRadius: 6,
      background: "var(--surface-2)", color: "var(--ink-3)",
      fontSize: 12, minWidth: 240,
    }}>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      Search projects, tasks, claims…
      <span style={{ marginLeft: "auto" }}><span className="kbd">⌘K</span></span>
    </div>
    <button className="btn btn-sm btn-ghost" style={{ width: 28, padding: 0 }}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="M8 1.5a4 4 0 00-4 4v3l-1.5 2h11L12 8.5v-3a4 4 0 00-4-4z" stroke="currentColor" strokeWidth="1.3" />
        <path d="M6 12.5a2 2 0 004 0" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    </button>
    <Avatar initials="JD" color="var(--ink)" />
  </div>
);

// ==================================================
// Project header
// ==================================================
const ProjectHeader = () => {
  const variance = 10; // days late
  return (
    <div style={{
      padding: "14px 16px", borderBottom: "1px solid var(--border)",
      background: "var(--surface)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "var(--ink-3)", marginBottom: 6 }}>
        <span>Projects</span>
        <span>›</span>
        <span style={{ color: "var(--ink-2)" }}>{PROJECT.name}</span>
        <span style={{ marginLeft: 8, padding: "1px 7px", background: "var(--ok-soft)", color: "var(--ok)", borderRadius: 4, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.3 }}>ACTIVE</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>
            {PROJECT.name}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 6, fontSize: 12, color: "var(--ink-3)" }}>
            <span>{PROJECT.builder}</span>
            <span>•</span>
            <span>Started 6 Jan 2026</span>
            <span>•</span>
            <span className="tabular">${(PROJECT.contract / 1000).toFixed(0)}k contract</span>
            <span>•</span>
            <span>Day 47 / 100</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "stretch", gap: 0, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--surface-2)" }}>
          <Stat label="Overall progress" value="47%" sub="target 52%" tone="warn" />
          <StatDiv />
          <Stat label="Variance" value="+10d" sub="vs baseline" tone="bad" />
          <StatDiv />
          <Stat label="Earned to date" value="$187,400" sub="of $497,500" tone="ok" />
          <StatDiv />
          <Stat label="Next milestone" value="Frame insp." sub="14 Apr" tone="info" />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-sm btn-ghost"><IconShare /> Share</button>
          <button className="btn btn-sm btn-primary"><IconClaim /> Generate claim</button>
        </div>
      </div>
      <div style={{ marginTop: 14, display: "flex", gap: 0 }}>
        {["Programme", "Progress", "Delays", "Payments", "Homeowner", "Subcontractors", "Files"].map((t, i) => (
          <a key={t} style={{
            padding: "8px 14px", fontSize: 12.5, fontWeight: 500,
            color: i === 0 ? "var(--ink)" : "var(--ink-3)",
            borderBottom: i === 0 ? "2px solid var(--ink)" : "2px solid transparent",
            marginBottom: -1, cursor: "pointer",
          }}>{t}</a>
        ))}
      </div>
    </div>
  );
};
const StatDiv = () => <div style={{ width: 1, background: "var(--border)" }} />;
const Stat = ({ label, value, sub, tone }) => {
  const c = tone === "ok" ? "var(--ok)" : tone === "warn" ? "var(--warn)" : tone === "bad" ? "var(--bad)" : "var(--info)";
  return (
    <div style={{ padding: "8px 14px", display: "flex", flexDirection: "column", gap: 2, minWidth: 100, background: "var(--surface)" }}>
      <span style={{ fontSize: 10.5, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>{label}</span>
      <span className="tabular" style={{ fontSize: 16, fontWeight: 600, color: c, letterSpacing: "-0.01em" }}>{value}</span>
      <span style={{ fontSize: 10.5, color: "var(--ink-4)" }}>{sub}</span>
    </div>
  );
};

// ==================================================
// Toolbar above gantt
// ==================================================
const GanttToolbar = ({ zoom, setZoom, baseline, setBaseline, critical, setCritical }) => (
  <div style={{
    display: "flex", alignItems: "center", padding: "8px 16px", gap: 8,
    borderBottom: "1px solid var(--border)", background: "var(--surface)",
  }}>
    <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
      {["Day", "Week", "Month"].map((z) => (
        <button key={z} onClick={() => setZoom(z)} style={{
          padding: "5px 10px", fontSize: 12, fontWeight: 500,
          border: "none", cursor: "pointer",
          background: zoom === z ? "var(--surface-2)" : "var(--surface)",
          color: zoom === z ? "var(--ink)" : "var(--ink-3)",
          fontFamily: "inherit",
        }}>{z}</button>
      ))}
    </div>
    <button className={`btn btn-sm ${baseline ? "btn-primary" : "btn-ghost"}`} onClick={() => setBaseline(!baseline)}>
      <IconBaseline /> Baseline
    </button>
    <button className={`btn btn-sm ${critical ? "btn-primary" : "btn-ghost"}`} onClick={() => setCritical(!critical)}>
      <IconCritical /> Critical path
    </button>
    <button className="btn btn-sm btn-ghost"><IconDeps /> Dependencies</button>
    <button className="btn btn-sm btn-ghost"><IconFilter /> Filter</button>
    <div style={{ flex: 1 }} />
    <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--ink-4)", marginRight: 4, verticalAlign: -1 }} />
      Baseline
      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--accent)", margin: "0 4px 0 12px", verticalAlign: -1 }} />
      Current
      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--critical)", margin: "0 4px 0 12px", verticalAlign: -1 }} />
      Critical
    </span>
    <button className="btn btn-sm btn-ghost"><IconExport /> Export</button>
    <button className="btn btn-sm">+ Task</button>
  </div>
);

// ==================================================
// Gantt
// ==================================================
const DAY_W = 11; // px per day
const ROW_H = 28;
const GROUP_H = 32;

const Gantt = ({ baseline, critical }) => {
  const tasksByPhase = PROJECT.phases.map((ph) => ({
    ...ph,
    tasks: TASKS.filter((t) => t.phase === ph.id),
  }));

  return (
    <div style={{
      flex: 1, display: "grid", gridTemplateColumns: "340px 1fr",
      background: "var(--surface)", overflow: "hidden",
      borderTop: "1px solid var(--border)",
    }}>
      {/* Left: task list */}
      <div style={{ borderRight: "1px solid var(--border)", overflow: "auto", background: "var(--surface)" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 80px 60px 50px",
          padding: "0 12px", height: 42, alignItems: "center",
          fontSize: 10.5, color: "var(--ink-3)", fontWeight: 600,
          textTransform: "uppercase", letterSpacing: 0.5,
          borderBottom: "1px solid var(--border)", background: "var(--surface-2)",
          position: "sticky", top: 0, zIndex: 2,
        }}>
          <span>Task</span>
          <span>Trade</span>
          <span style={{ textAlign: "right" }}>Days</span>
          <span style={{ textAlign: "right" }}>%</span>
        </div>
        {tasksByPhase.map((ph) => (
          <React.Fragment key={ph.id}>
            <div style={{
              height: GROUP_H, padding: "0 12px", display: "flex", alignItems: "center",
              gap: 8, background: "var(--surface-2)",
              borderBottom: "1px solid var(--border)",
              fontSize: 12, fontWeight: 600,
            }}>
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ color: "var(--ink-3)" }}>
                <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={{ width: 6, height: 6, borderRadius: 2, background: ph.color }} />
              <span style={{ color: "var(--ink)" }}>{ph.name}</span>
              <span style={{ color: "var(--ink-3)", fontWeight: 400, fontSize: 11 }}>· {ph.tasks.length}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)", fontWeight: 500 }} className="tabular">{ph.progress}%</span>
            </div>
            {ph.tasks.map((t) => (
              <div key={t.id} style={{
                display: "grid", gridTemplateColumns: "1fr 80px 60px 50px",
                padding: "0 12px 0 22px", height: ROW_H, alignItems: "center",
                fontSize: 12, borderBottom: "1px solid var(--border)",
                cursor: "pointer",
              }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                  {t.milestone && (
                    <svg width="9" height="9" viewBox="0 0 10 10" style={{ flex: "none" }}>
                      <path d="M5 0.5l4.5 4.5L5 9.5 0.5 5 5 0.5z" fill="var(--accent)" />
                    </svg>
                  )}
                  {critical && t.critical && (
                    <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--critical)", flex: "none" }} />
                  )}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                </span>
                <span style={{ color: "var(--ink-3)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.trade}</span>
                <span className="tabular" style={{ textAlign: "right", color: "var(--ink-3)", fontSize: 11 }}>{t.pd}d</span>
                <span className="tabular" style={{ textAlign: "right", fontWeight: 500, color: t.progress === 100 ? "var(--ok)" : t.progress > 0 ? "var(--ink)" : "var(--ink-4)" }}>{t.progress}%</span>
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>

      {/* Right: gantt timeline */}
      <div style={{ overflow: "auto", position: "relative", background: "var(--surface)" }}>
        <GanttTimeline />
        <div style={{ position: "relative", minHeight: 800 }}>
          <GanttGrid />
          <GanttBars baseline={baseline} critical={critical} />
        </div>
      </div>
    </div>
  );
};

const TIMELINE_H = 42;

const GanttTimeline = () => {
  const totalDays = MONTHS.reduce((s, m) => s + m.days, 0);
  const totalW = totalDays * DAY_W;
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 3, background: "var(--surface-2)",
      borderBottom: "1px solid var(--border)", height: TIMELINE_H, width: totalW,
    }}>
      {/* Months row */}
      <div style={{ height: 22, display: "flex", borderBottom: "1px solid var(--border)" }}>
        {MONTHS.reduce((acc, m) => {
          const left = acc.left;
          acc.nodes.push(
            <div key={m.name} style={{
              width: m.days * DAY_W, padding: "0 8px", display: "flex", alignItems: "center",
              fontSize: 11, fontWeight: 600, color: "var(--ink-2)",
              borderRight: "1px solid var(--border)",
            }}>
              {m.name} <span style={{ color: "var(--ink-4)", marginLeft: 4, fontWeight: 400 }}>2026</span>
            </div>
          );
          acc.left = left + m.days * DAY_W;
          return acc;
        }, { nodes: [], left: 0 }).nodes}
      </div>
      {/* Days row */}
      <div style={{ height: 20, display: "flex" }}>
        {Array.from({ length: totalDays }, (_, i) => (
          <div key={i} style={{
            width: DAY_W, fontSize: 9.5, color: "var(--ink-4)", textAlign: "center",
            lineHeight: "20px", fontVariantNumeric: "tabular-nums",
            borderRight: i % 7 === 6 ? "1px solid var(--border)" : "none",
          }}>{i % 7 === 0 ? (i + 1) : ""}</div>
        ))}
      </div>
    </div>
  );
};

const GanttGrid = () => {
  const totalDays = MONTHS.reduce((s, m) => s + m.days, 0);
  const totalW = totalDays * DAY_W;
  // weekend stripes
  return (
    <svg width={totalW} height="800" style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
      {Array.from({ length: totalDays }, (_, i) => {
        if (i % 7 === 5 || i % 7 === 6) {
          return <rect key={i} x={i * DAY_W} y={0} width={DAY_W} height="800" fill="var(--surface-2)" opacity="0.5" />;
        }
        return null;
      })}
      {/* Month dividers */}
      {MONTHS.reduce((acc, m) => {
        acc.nodes.push(<line key={m.name} x1={acc.left + m.days * DAY_W} x2={acc.left + m.days * DAY_W} y1={0} y2={800} stroke="var(--border)" strokeWidth="1" />);
        acc.left += m.days * DAY_W;
        return acc;
      }, { nodes: [], left: 0 }).nodes}
      {/* Today line */}
      <line x1={TODAY_DAY * DAY_W} x2={TODAY_DAY * DAY_W} y1={0} y2={800} stroke="var(--bad)" strokeWidth="1.5" strokeDasharray="3 3" />
      <rect x={TODAY_DAY * DAY_W - 24} y={4} width={48} height={16} rx={3} fill="var(--bad)" />
      <text x={TODAY_DAY * DAY_W} y={15} fill="#fff" fontSize="10" fontWeight="600" textAnchor="middle" fontFamily="var(--font-mono)">TODAY</text>
    </svg>
  );
};

const GanttBars = ({ baseline, critical }) => {
  let y = 0;
  const rows = [];
  PROJECT.phases.forEach((ph) => {
    // Phase summary row
    const phTasks = TASKS.filter((t) => t.phase === ph.id);
    const minStart = Math.min(...phTasks.map((t) => t.ps));
    const maxEnd = Math.max(...phTasks.map((t) => t.ps + t.pd));
    rows.push(
      <PhaseSummary key={ph.id} y={y} ph={ph} start={minStart} end={maxEnd} />
    );
    y += GROUP_H;
    phTasks.forEach((t) => {
      rows.push(<TaskBar key={t.id} y={y} task={t} phase={ph} baseline={baseline} critical={critical} />);
      y += ROW_H;
    });
  });
  return <div style={{ position: "absolute", top: 0, left: 0, right: 0 }}>{rows}</div>;
};

const PhaseSummary = ({ y, ph, start, end }) => (
  <div style={{
    position: "absolute", top: y, left: 0, right: 0, height: GROUP_H,
    background: "var(--surface-2)", borderBottom: "1px solid var(--border)",
  }}>
    <div style={{
      position: "absolute", top: 12, left: start * DAY_W, width: (end - start) * DAY_W, height: 8,
      background: ph.color, borderRadius: 2, opacity: 0.25,
    }} />
    <div style={{
      position: "absolute", top: 12, left: start * DAY_W, width: (end - start) * DAY_W * (ph.progress / 100), height: 8,
      background: ph.color, borderRadius: 2,
    }} />
    {/* phase brackets */}
    <div style={{
      position: "absolute", top: 9, left: start * DAY_W - 1, width: 3, height: 14, background: ph.color,
    }} />
    <div style={{
      position: "absolute", top: 9, left: end * DAY_W - 2, width: 3, height: 14, background: ph.color,
    }} />
  </div>
);

const TaskBar = ({ y, task, phase, baseline, critical }) => {
  const startActual = task.as || task.ps;
  const durActual = task.ad || task.pd;
  const isCritical = critical && task.critical;
  const isLate = task.as > task.ps || task.ad > task.pd;
  const barColor = isCritical ? "var(--critical)" : phase.color;

  if (task.milestone) {
    return (
      <div style={{ position: "absolute", top: y, left: 0, right: 0, height: ROW_H, borderBottom: "1px solid var(--border)" }}>
        <div style={{
          position: "absolute", top: 6, left: task.ps * DAY_W - 7,
          width: 14, height: 14, background: "var(--accent)",
          transform: "rotate(45deg)", borderRadius: 2,
          boxShadow: "var(--shadow-sm)",
        }} />
        <span style={{
          position: "absolute", top: 7, left: task.ps * DAY_W + 12,
          fontSize: 10.5, fontWeight: 600, color: "var(--accent-ink)",
          whiteSpace: "nowrap",
        }}>{task.name}</span>
      </div>
    );
  }

  return (
    <div style={{ position: "absolute", top: y, left: 0, right: 0, height: ROW_H, borderBottom: "1px solid var(--border)" }}>
      {/* Baseline (planned) */}
      {baseline && (
        <div style={{
          position: "absolute", top: 18, left: task.ps * DAY_W,
          width: task.pd * DAY_W, height: 4,
          background: "var(--ink-4)", opacity: 0.45,
          borderRadius: 2,
        }} />
      )}
      {/* Current bar */}
      <div style={{
        position: "absolute", top: 6, left: startActual * DAY_W,
        width: durActual * DAY_W, height: 14,
        background: barColor, borderRadius: 3,
        opacity: 0.25,
        border: isCritical ? "1px solid var(--critical)" : "none",
      }} />
      {/* Filled progress */}
      <div style={{
        position: "absolute", top: 6, left: startActual * DAY_W,
        width: durActual * DAY_W * (task.progress / 100), height: 14,
        background: barColor, borderRadius: 3,
      }} />
      {/* progress text */}
      {task.progress > 0 && task.progress < 100 && durActual >= 4 && (
        <span style={{
          position: "absolute", top: 7, left: startActual * DAY_W + 5,
          fontSize: 9.5, fontWeight: 600, color: "#fff",
          fontVariantNumeric: "tabular-nums",
        }}>{task.progress}%</span>
      )}
      {/* late indicator */}
      {isLate && task.progress < 100 && (
        <div style={{
          position: "absolute", top: 8, left: (task.ps + task.pd) * DAY_W,
          width: ((startActual + durActual) - (task.ps + task.pd)) * DAY_W,
          height: 10, background: "repeating-linear-gradient(45deg, var(--bad) 0 3px, transparent 3px 6px)",
          borderRadius: 2, opacity: 0.6,
        }} />
      )}
    </div>
  );
};

// ==================================================
// Right inspector
// ==================================================
const Inspector = () => (
  <aside style={{
    width: 300, borderLeft: "1px solid var(--border)", background: "var(--surface)",
    display: "flex", flexDirection: "column", overflow: "hidden",
  }}>
    <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
        <path d="M6 0.5l5.5 5.5L6 11.5 0.5 6 6 0.5z" fill="var(--accent)" />
      </svg>
      <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>Pour slab — section 2</span>
      <button className="btn btn-sm btn-ghost" style={{ width: 22, height: 22, padding: 0 }}>×</button>
    </div>
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14, overflow: "auto" }}>
      <Field label="Trade">
        <span style={{ fontSize: 12.5 }}>Concreter · Marlow Concrete Pty</span>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Field label="Planned start"><span className="mono" style={{ fontSize: 11.5 }}>30 Jan 2026</span></Field>
        <Field label="Current start"><span className="mono" style={{ fontSize: 11.5, color: "var(--bad)" }}>31 Jan 2026</span></Field>
        <Field label="Planned end"><span className="mono" style={{ fontSize: 11.5 }}>30 Jan 2026</span></Field>
        <Field label="Current end"><span className="mono" style={{ fontSize: 11.5, color: "var(--bad)" }}>1 Feb 2026</span></Field>
      </div>
      <Field label="Progress">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ProgressBar value={90} height={6} color="var(--ok)" />
          <span className="tabular" style={{ fontSize: 12.5, fontWeight: 600 }}>90%</span>
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
          {[0, 25, 50, 75, 100].map((p) => (
            <button key={p} className="btn btn-sm btn-ghost" style={{
              flex: 1, padding: 0, fontSize: 11,
              background: p === 90 ? "var(--surface-2)" : undefined,
              borderColor: p === 90 ? "var(--border-strong)" : undefined,
            }}>{p}</button>
          ))}
        </div>
      </Field>
      <Field label="Contract value">
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span className="tabular" style={{ fontSize: 16, fontWeight: 600 }}>$32,500</span>
          <span style={{ fontSize: 11, color: "var(--ink-3)" }}>· $29,250 earned</span>
        </div>
      </Field>
      <Field label="Dependencies">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>↑ Pour slab — section 1 <span className="chip ok" style={{ marginLeft: 4 }}>done</span></span>
          <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>↓ Slab cure <span className="chip warn" style={{ marginLeft: 4 }}>blocked by this</span></span>
        </div>
      </Field>
      <Field label="Activity">
        <ActivityItem who="Tom (sub)" what="updated progress 75% → 90%" when="2h ago" />
        <ActivityItem who="Sam" what="added photo" when="yesterday" />
        <ActivityItem who="Jess" what="logged 3d delay (rain)" when="2 weeks ago" />
      </Field>
    </div>
  </aside>
);
const Field = ({ label, children }) => (
  <div>
    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
    {children}
  </div>
);
const ActivityItem = ({ who, what, when }) => (
  <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "4px 0" }}>
    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", marginTop: 6 }} />
    <div style={{ flex: 1, fontSize: 11.5 }}>
      <span style={{ fontWeight: 500 }}>{who}</span>{" "}
      <span style={{ color: "var(--ink-3)" }}>{what}</span>
      <div style={{ fontSize: 10.5, color: "var(--ink-4)" }}>{when}</div>
    </div>
  </div>
);

// ==================================================
// Icons
// ==================================================
const IconShare = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 1v9M5 4l3-3 3 3M2 11v3a1 1 0 001 1h10a1 1 0 001-1v-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const IconClaim = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="3" y="2" width="10" height="12" rx="1" stroke="currentColor" strokeWidth="1.4" /><path d="M5 5h6M5 8h6M5 11h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>;
const IconBaseline = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="2" y="4" width="12" height="3" stroke="currentColor" strokeWidth="1.4" /><rect x="2" y="9" width="8" height="3" fill="currentColor" /></svg>;
const IconCritical = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 1l1.5 4.5L14 6l-3.5 3 1 4.5L8 11l-3.5 2.5 1-4.5L2 6l4.5-0.5L8 1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>;
const IconDeps = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="3" cy="4" r="2" stroke="currentColor" strokeWidth="1.4" /><circle cx="13" cy="4" r="2" stroke="currentColor" strokeWidth="1.4" /><circle cx="8" cy="12" r="2" stroke="currentColor" strokeWidth="1.4" /><path d="M5 4h6M4 6l3 4M12 6l-3 4" stroke="currentColor" strokeWidth="1.4" /></svg>;
const IconFilter = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 3h12l-4.5 6v4l-3 1V9L2 3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>;
const IconExport = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 10V2M5 5l3-3 3 3M2 11v3a1 1 0 001 1h10a1 1 0 001-1v-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;

// ==================================================
// Top-level export
// ==================================================
const ProgrammeScreen = ({ width = 1280, height = 820 }) => {
  const [zoom, setZoom] = React.useState("Week");
  const [baseline, setBaseline] = React.useState(true);
  const [critical, setCritical] = React.useState(true);
  return (
    <div style={{
      width, height, display: "flex", flexDirection: "column",
      background: "var(--bg)", overflow: "hidden",
      fontFamily: "var(--font-ui)",
    }}>
      <TopBar />
      <ProjectHeader />
      <GanttToolbar zoom={zoom} setZoom={setZoom} baseline={baseline} setBaseline={setBaseline} critical={critical} setCritical={setCritical} />
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <Gantt baseline={baseline} critical={critical} />
        <Inspector />
      </div>
    </div>
  );
};

window.ProgrammeScreen = ProgrammeScreen;
