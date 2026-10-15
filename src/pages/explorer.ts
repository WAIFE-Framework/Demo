import { bar } from "../charts.js";
import { getData, getState, select } from "../store.js";
import type { Scored } from "../types.js";
import { FRAMEWORKS, HORIZON_LABEL, OBLIGATION_LABEL, STATUS_LABEL, STRENGTH_LABEL, f2, h, pct, replace } from "../ui.js";
import type { Page } from "./page.js";

type Mode = "goal" | "requirement";

export function explorerPage(): Page {
  const data = getData();
  let mode: Mode = "goal";
  let goalId = data.goals[1]?.id ?? data.goals[0].id;
  let fw = "ISO 42001";
  let reqId = "";

  const reqsOf = (f: string) => data.requirements.filter((r) => r.framework === f && r.linkable);
  reqId = reqsOf(fw)[0]?.id ?? "";

  const modeTabs = h("div", { class: "tabs", role: "tablist" },
    (["goal", "requirement"] as Mode[]).map((m) => h("button", { type: "button", role: "tab", "data-m": m, onclick: () => { mode = m; render(); } },
      m === "goal" ? "Start from an enterprise goal" : "Start from a requirement")));
  const pickers = h("div", { class: "pickers" });
  const out = h("div", { class: "explorer-out" });

  const el = h("div", { class: "page" },
    h("h1", null, "Explorer"),
    h("p", { class: "lead" }, "Pick a goal or a requirement and see which actions serve it, ranked for your organisation's context. The ranking follows the context you set on the Roadmap page."),
    modeTabs, pickers, out);

  function row(sc: Scored, strength: string): HTMLElement {
    return h("tr", { tabindex: 0, onclick: () => select(sc.action.id), onkeydown: (e: Event) => { if ((e as KeyboardEvent).key === "Enter") select(sc.action.id); } },
      h("td", null, sc.rank ? String(sc.rank) : "–"), h("td", null, h("b", null, sc.action.id)), h("td", { class: "t-title" }, sc.action.title),
      h("td", null, sc.action.domain), h("td", null, strength),
      h("td", null, sc.active ? f2(sc.value) : "–"), h("td", null, sc.horizon ? `H${sc.horizon}` : "–"), h("td", null, STATUS_LABEL[sc.status]));
  }

  function table(rows: { sc: Scored; strength: string }[]): HTMLElement {
    rows.sort((a, b) => (a.sc.active === b.sc.active ? (a.sc.rank ?? 1e9) - (b.sc.rank ?? 1e9) : a.sc.active ? -1 : 1));
    return h("div", { class: "table-wrap" }, h("table", { class: "data" },
      h("thead", null, h("tr", null, ["Rank", "ID", "Action", "Domain", "Link", "Value", "Horizon", "Status"].map((t) => h("th", null, t)))),
      h("tbody", null, rows.map(({ sc, strength }) => row(sc, strength)))));
  }

  function renderGoal() {
    const st = getState();
    const g = data.goals.find((x) => x.id === goalId)!;
    const rows = data.goalLinks.filter((l) => l.goalId === goalId).map((l) => ({ sc: st.result.byId.get(l.actionId)!, strength: l.strength >= 1 ? "Main" : "Secondary" })).filter((x) => x.sc);
    const act = rows.filter((x) => x.sc.active);
    replace(out,
      h("div", { class: "explorer-head" }, h("h2", null, `${g.id} ${g.title}`),
        h("p", null, `${g.perspective} perspective. You give this goal ${pct(st.result.goalWeights[g.id] ?? 0)} of your total weighting. ${rows.length} actions contribute to it, ${act.length} are on your roadmap now.`)),
      table(rows));
  }

  function renderReq() {
    const st = getState();
    const r = data.requirements.find((x) => x.id === reqId);
    if (!r) { replace(out, h("p", null, "No requirement selected.")); return; }
    const cov = st.result.coverage.find((c) => c.req.id === r.id);
    const rows = data.links.filter((l) => l.requirementId === r.id).map((l) => ({ sc: st.result.byId.get(l.actionId)!, strength: STRENGTH_LABEL[l.strength] })).filter((x) => x.sc);
    replace(out,
      h("div", { class: "explorer-head" },
        h("h2", null, `${r.framework} ${r.code}: ${r.title}`),
        h("p", null, h("span", { class: `chip ob-${r.obligation}` }, OBLIGATION_LABEL[r.obligation]), " ",
          cov && !cov.applicable ? h("span", { class: "chip" }, "Does not apply to your role / risk profile") : null,
          r.titleSource !== "workbook+claude" ? h("span", { class: "chip" }, "title drafted by Claude, verify") : null),
        r.workbookCoverage ? h("p", { class: "note" }, `Workbook assessment of this EU requirement after ISO 42001: ${r.workbookCoverage}. Still needed: ${r.workbookRemaining ?? "–"} (Dutch)`) : null,
        cov ? h("div", { class: "cov-line" }, h("span", null, "Coverage now"), bar(cov.coverage), h("span", null, pct(cov.coverage)),
          h("span", null, `by month 6`), bar(cov.projected[1]), h("span", null, pct(cov.projected[1]))) : null),
      rows.length ? table(rows) : h("p", { class: "empty-state" }, "No action in the current set serves this requirement. This is a gap in the action list."));
  }

  function render() {
    for (const b of modeTabs.children) { const on = (b as HTMLElement).dataset.m === mode; b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on)); }
    if (mode === "goal") {
      replace(pickers, h("label", { class: "field" }, h("span", null, "Enterprise goal"),
        h("select", { onchange: (e: Event) => { goalId = (e.target as HTMLSelectElement).value; render(); } },
          data.goals.map((g) => h("option", { value: g.id, selected: g.id === goalId }, `${g.id} ${g.title}`)))));
      renderGoal();
    } else {
      replace(pickers,
        h("label", { class: "field" }, h("span", null, "Framework"),
          h("select", { onchange: (e: Event) => { fw = (e.target as HTMLSelectElement).value; reqId = reqsOf(fw)[0]?.id ?? ""; render(); } },
            FRAMEWORKS.map((f) => h("option", { value: f, selected: f === fw }, f)))),
        h("label", { class: "field wide" }, h("span", null, "Requirement"),
          h("select", { onchange: (e: Event) => { reqId = (e.target as HTMLSelectElement).value; render(); } },
            reqsOf(fw).map((r) => h("option", { value: r.id, selected: r.id === reqId }, `${r.code}  ${r.title}`)))));
      renderReq();
    }
  }
  render();
  return { el, update: () => (mode === "goal" ? renderGoal() : renderReq()) };
}
