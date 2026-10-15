import { SCENARIOS } from "../defaults.js";
import { activeSorted } from "../engine.js";
import { scatter } from "../charts.js";
import { statusSelect } from "../drawer.js";
import { getData, getState, resetStatus, select, setScenario, setStatus, shareLink, update } from "../store.js";
import type { OrgSize, RiskClass, Role, Scored, Status } from "../types.js";
import { HORIZON_LABEL, STATUS_LABEL, csv, download, f1, f2, h, pct, replace } from "../ui.js";
import type { Page } from "./page.js";

type View = "board" | "table" | "chart";

export function roadmapPage(): Page {
  const data = getData();
  let view: View = "board";
  let showAll = false;
  let sortKey = "sequence";
  let sortDir = 1;

  // ------------------------------------------------------------------ context rail
  const scenarioSel = h("select", { "aria-label": "Scenario", onchange: (e: Event) => setScenario((e.target as HTMLSelectElement).value) },
    SCENARIOS.map((s) => h("option", { value: s.id }, s.name)));
  const scenarioNote = h("p", { class: "note" });
  const sizeSel = select3("Organisation size", [["small", "Small"], ["medium", "Medium"], ["large", "Large"]], (v) => update((p) => (p.orgSize = v as OrgSize)));
  const roleSel = select3("EU AI Act role", [["provider", "Provider"], ["deployer", "Deployer"], ["both", "Both"], ["unknown", "Not sure"]], (v) => update((p) => (p.role = v as Role)));
  const riskSel = select3("High-risk systems", [["high", "Yes"], ["nothigh", "No"], ["unknown", "Not sure"]], (v) => update((p) => (p.risk = v as RiskClass)));
  const techBox = h("input", { type: "checkbox", id: "tech", onchange: (e: Event) => update((p) => (p.includeTechnical = (e.target as HTMLInputElement).checked)) });

  const sliders = new Map<string, { input: HTMLInputElement; out: HTMLElement; w: HTMLElement }>();
  const goalRows = data.goals.map((g) => {
    const input = h("input", { type: "range", min: 1, max: 5, step: 1, "aria-label": `Importance of ${g.id} ${g.title}`,
      oninput: (e: Event) => update((p) => (p.importance[g.id] = Number((e.target as HTMLInputElement).value))) });
    const out = h("span", { class: "sl-val" });
    const w = h("span", { class: "sl-w" });
    sliders.set(g.id, { input, out, w });
    return h("div", { class: "sl-row" },
      h("label", null, h("b", null, g.id), " ", g.title), h("div", { class: "sl-ctl" }, input, out, w));
  });

  const matSel = new Map<string, { cur: HTMLSelectElement; tgt: HTMLSelectElement }>();
  const matRows = data.domains.map((d) => {
    const mk = (kind: "current" | "target") => h("select", { "aria-label": `${kind} maturity of ${d}`,
      onchange: (e: Event) => update((p) => { p[kind][d] = Number((e.target as HTMLSelectElement).value); if (p.target[d] < p.current[d]) p.target[d] = p.current[d]; }) },
      [1, 2, 3, 4, 5].map((n) => h("option", { value: n }, String(n))));
    const cur = mk("current"), tgt = mk("target");
    matSel.set(d, { cur, tgt });
    return h("tr", null, h("td", null, d), h("td", null, cur), h("td", null, tgt));
  });
  function select3(label: string, opts: [string, string][], onChange: (v: string) => void) {
    return h("select", { "aria-label": label, onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value) },
      opts.map(([v, t]) => h("option", { value: v }, t)));
  }

  const railBody = h("div", { class: "rail-body" },
    h("label", { class: "field" }, h("span", null, "Starting point"), scenarioSel),
    scenarioNote,
    h("div", { class: "grid2" },
      h("label", { class: "field" }, h("span", null, "Organisation size"), sizeSel),
      h("label", { class: "field" }, h("span", null, "EU AI Act role"), roleSel),
      h("label", { class: "field" }, h("span", null, "High-risk systems"), riskSel)),
    h("label", { class: "check" }, techBox, " Include technical actions"),
    h("h3", null, "What matters to your organisation"),
    h("p", { class: "note" }, "Rate how important each COBIT enterprise goal is (1 low, 5 high). The percentage shows its share of your total weighting."),
    h("div", { class: "sliders" }, goalRows),
    h("details", { class: "mat" }, h("summary", null, "Maturity per domain"),
      h("p", { class: "note" }, "Where you are now and where you want to be (1 initial, 5 optimised). A larger gap raises the need for actions in that domain."),
      h("table", null, h("thead", null, h("tr", null, h("th", null, "Domain"), h("th", null, "Now"), h("th", null, "Goal"))), h("tbody", null, matRows))),
  );
  const railToggle = h("button", { type: "button", class: "rail-toggle", "aria-expanded": false, onclick: () => {
    const open = rail.classList.toggle("open"); railToggle.setAttribute("aria-expanded", String(open)); } }, "Your context");
  const rail = h("aside", { class: "rail", "aria-label": "Your context" }, h("h2", { class: "rail-title" }, "Your context"), railToggle, railBody);

  // ------------------------------------------------------------------ results
  const summary = h("div", { class: "summary" });
  const warn = h("div", { class: "warn", hidden: true });
  const tabs = h("div", { class: "tabs", role: "tablist" },
    (["board", "table", "chart"] as View[]).map((v) => h("button", { type: "button", role: "tab", "data-v": v, onclick: () => { view = v; render(); } },
      v === "board" ? "Roadmap" : v === "table" ? "Table" : "Value and effort")));
  const body = h("div", { class: "results-body" });
  const toolbar = h("div", { class: "toolbar" },
    h("button", { type: "button", class: "btn", onclick: exportCsv }, "Download CSV"),
    h("button", { type: "button", class: "btn", onclick: async (e: Event) => {
      const b = e.target as HTMLButtonElement; const link = shareLink();
      try { await navigator.clipboard.writeText(link); b.textContent = "Link copied"; } catch { prompt("Copy this link", link); }
      setTimeout(() => (b.textContent = "Copy link to this view"), 1800); } }, "Copy link to this view"),
    h("button", { type: "button", class: "btn ghost", onclick: () => { if (confirm("Clear all status marks (in progress / done)?")) resetStatus(); } }, "Clear progress"));

  const results = h("section", { class: "results" },
    h("div", { class: "banner" }, h("b", null, "Prototype data. "),
      "The 92 actions and their links come from the thesis workbook and are not expert-validated yet. Effort values are placeholders. Use the roadmap to explore how the framework reacts, not as advice."),
    summary, warn, h("div", { class: "bar-row" }, tabs, toolbar), body);

  const el = h("div", { class: "layout" }, rail, results);

  // ------------------------------------------------------------------ rendering
  function moved(sc: Scored): HTMLElement | null {
    const prev = getState().previous?.byId.get(sc.action.id);
    if (!prev || !prev.active || !sc.active || prev.sequence === null || sc.sequence === null) return null;
    const d = prev.sequence - sc.sequence;
    if (Math.abs(d) < 3) return null;
    return h("span", { class: `moved ${d > 0 ? "up" : "down"}`, title: `Was position ${prev.sequence}` }, d > 0 ? `▲ ${d}` : `▼ ${-d}`);
  }

  function card(sc: Scored): HTMLElement {
    const a = sc.action;
    const nextStatus: Record<Status, Status> = { notStarted: "inProgress", inProgress: "done", done: "notStarted" };
    return h("article", { class: `card st-${sc.status}`, tabindex: 0, role: "button", "aria-label": `${a.id}: ${a.title}`,
      onclick: () => select(a.id), onkeydown: (e: Event) => { const k = (e as KeyboardEvent).key; if (k === "Enter" || k === " ") { e.preventDefault(); select(a.id); } } },
      h("div", { class: "card-top" }, h("span", { class: "id" }, a.id), moved(sc),
        h("button", { type: "button", class: `st-btn st-${sc.status}`, title: `${STATUS_LABEL[sc.status]}. Click to mark as ${STATUS_LABEL[nextStatus[sc.status]].toLowerCase()}`,
          "aria-label": `Status ${STATUS_LABEL[sc.status]}, change to ${STATUS_LABEL[nextStatus[sc.status]]}`,
          onclick: (e: Event) => { e.stopPropagation(); setStatus(a.id, nextStatus[sc.status]); } },
          sc.status === "done" ? "✓" : sc.status === "inProgress" ? "◐" : "○")),
      h("p", { class: "card-title" }, a.title),
      h("div", { class: "card-meta" }, h("span", null, a.domain), h("span", { class: `quad q-${(sc.quadrant ?? "").replace(/\s/g, "").toLowerCase()}` }, sc.quadrant),
        h("span", { class: "effort", title: `Effort ${f1(sc.effort)}${sc.effortSource === "placeholder" ? " (placeholder)" : ""}` }, dots(sc.effort))));
  }

  function dots(effort: number): string {
    const n = Math.max(1, Math.min(5, Math.round(effort / 1.2)));
    return "●".repeat(n) + "○".repeat(5 - n);
  }

  function renderSummary() {
    const r = getState().result;
    const act = r.scored.filter((s) => s.active);
    const placeholders = act.filter((s) => s.effortSource === "placeholder").length;
    const done = r.scored.filter((s) => s.status === "done" && (s.action.inScope || getState().profile.includeTechnical)).length;
    const total = act.length + done;
    const gap = data.domains.reduce((t, d) => t + Math.max(0, getState().profile.target[d] - getState().profile.current[d]), 0) / data.domains.length;
    const stat = (v: string, l: string) => h("div", { class: "stat" }, h("b", null, v), h("span", null, l));
    replace(summary,
      stat(String(act.length), "actions on the roadmap"),
      stat(String(act.filter((s) => s.quadrant === "Quick win").length), "quick wins"),
      stat(String(act.filter((s) => s.horizon === 1).length), "to start in the first 3 months"),
      stat(`${done} / ${total}`, "done"),
      stat(f1(gap), "average maturity step to take"),
      stat(pct(act.length ? placeholders / act.length : 0), "of effort values still placeholders"));
    if (r.warnings.length) { warn.hidden = false; replace(warn, h("b", null, "Check the data: "), r.warnings.join(" ")); } else warn.hidden = true;
  }

  function renderBoard() {
    const seq = activeSorted(getState().result);
    const cols = [1, 2, 3, 4].map((hz) => {
      const items = seq.filter((s) => s.horizon === hz);
      const limit = hz === 4 && !showAll ? 10 : items.length;
      const effort = items.reduce((t, s) => t + s.remainingEffort, 0);
      return h("section", { class: `col h${hz}` },
        h("header", null, h("h3", null, HORIZON_LABEL[hz - 1]), h("span", null, `${items.length} actions · effort ${f1(effort)}`)),
        h("div", { class: "cards" }, items.slice(0, limit).map(card),
          items.length > limit ? h("button", { type: "button", class: "btn more", onclick: () => { showAll = true; render(); } }, `Show all ${items.length}`) : null,
          !items.length ? h("p", { class: "dim empty" }, "Nothing planned here.") : null));
    });
    replace(body, h("p", { class: "note" }, "Actions are ordered so that prerequisites always come first. Within that, higher value for less effort comes earlier. Click an action to see why."),
      h("div", { class: "board" }, cols));
  }

  function renderTable() {
    const r = getState().result;
    const rows = r.scored.filter((s) => s.active);
    const val = (s: Scored): string | number => ({
      sequence: s.sequence ?? 0, id: s.action.id, title: s.action.title, domain: s.action.domain, owner: s.action.owner, horizon: s.horizon ?? 0,
      value: s.value, effort: s.effort, priority: s.priorityIndex, quadrant: s.quadrant ?? "", layer: s.layer, status: s.status,
    } as Record<string, string | number>)[sortKey];
    rows.sort((a, b) => { const x = val(a), y = val(b); return (typeof x === "number" ? x - (y as number) : String(x).localeCompare(String(y))) * sortDir; });
    const th = (k: string, label: string) => h("th", { "aria-sort": sortKey === k ? (sortDir > 0 ? "ascending" : "descending") : "none" },
      h("button", { type: "button", onclick: () => { if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = 1; } render(); } }, label));
    replace(body, h("div", { class: "table-wrap" }, h("table", { class: "data" },
      h("thead", null, h("tr", null, th("sequence", "#"), th("id", "ID"), th("title", "Action"), th("domain", "Domain"), th("owner", "Owner"), th("horizon", "Horizon"),
        th("value", "Value"), th("effort", "Effort"), th("priority", "Priority"), th("quadrant", "Quadrant"), th("layer", "Layer"), th("status", "Status"))),
      h("tbody", null, rows.map((s) => h("tr", { tabindex: 0, onclick: () => select(s.action.id), onkeydown: (e: Event) => { if ((e as KeyboardEvent).key === "Enter") select(s.action.id); } },
        h("td", null, String(s.sequence)), h("td", null, h("b", null, s.action.id)), h("td", { class: "t-title" }, s.action.title), h("td", null, s.action.domain),
        h("td", null, s.action.owner), h("td", null, `H${s.horizon}`), h("td", null, f2(s.value)), h("td", null, f1(s.effort)), h("td", null, f1(s.priorityIndex)),
        h("td", null, s.quadrant), h("td", null, String(s.layer)), h("td", { onclick: (e: Event) => e.stopPropagation() }, statusSelect(s.action.id))))))));
  }

  function renderChart() {
    const r = getState().result;
    const act = r.scored.filter((s) => s.active);
    const count = (q: string) => act.filter((s) => s.quadrant === q).length;
    replace(body, h("div", { class: "chart-card" },
      h("p", { class: "note" }, `Each dot is an action. Top left (${count("Quick win")} quick wins) gives the most value for the least effort. Dashed lines mark the median value and median effort. Click a dot for details.`),
      scatter(r, (id) => select(id)),
      h("p", { class: "note" }, `Quadrant counts: quick wins ${count("Quick win")}, major projects ${count("Major project")}, fill-ins ${count("Fill-in")}, defer ${count("Defer")}.`)));
  }

  function exportCsv() {
    const r = getState().result;
    const rows: (string | number | null)[][] = [["Sequence", "Horizon", "ID", "Action", "Domain", "Owner", "Level", "Layer", "Value", "Effort", "EffortSource", "PriorityIndex", "Rank", "Quadrant", "Status", "Prerequisites"]];
    for (const s of activeSorted(r)) rows.push([s.sequence, s.horizon, s.action.id, s.action.title, s.action.domain, s.action.owner, s.action.level, s.layer,
      +s.value.toFixed(4), +s.effort.toFixed(2), s.effortSource, +s.priorityIndex.toFixed(2), s.rank, s.quadrant, STATUS_LABEL[s.status], s.prerequisites.join(" ")]);
    download("ai-governance-roadmap.csv", csv(rows));
  }

  function render() {
    for (const b of tabs.children) { const on = (b as HTMLElement).dataset.v === view; b.setAttribute("aria-selected", String(on)); b.classList.toggle("on", on); }
    renderSummary();
    if (view === "board") renderBoard(); else if (view === "table") renderTable(); else renderChart();
  }

  function syncRail() {
    const { profile } = getState();
    scenarioSel.value = profile.scenarioId;
    const sc = SCENARIOS.find((s) => s.id === profile.scenarioId);
    scenarioNote.textContent = (sc ? sc.description + " " : "") + "Starting values are illustrative; change anything and the roadmap follows.";
    sizeSel.value = profile.orgSize; roleSel.value = profile.role; riskSel.value = profile.risk;
    (techBox as HTMLInputElement).checked = profile.includeTechnical;
    const w = getState().result.goalWeights;
    for (const [id, c] of sliders) { c.input.value = String(profile.importance[id] ?? 3); c.out.textContent = String(profile.importance[id] ?? 3); c.w.textContent = pct(w[id] ?? 0); }
    for (const [d, c] of matSel) { c.cur.value = String(profile.current[d]); c.tgt.value = String(profile.target[d]); }
  }

  return { el, update: () => { syncRail(); render(); } };
}
