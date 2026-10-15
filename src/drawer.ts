import { getData, getState, select, setStatus } from "./store.js";
import type { Scored, Status } from "./types.js";
import { FRAMEWORKS, HORIZON_LABEL, OBLIGATION_LABEL, STATUS_LABEL, STRENGTH_LABEL, f1, f2, h, pct, replace } from "./ui.js";

export function statusControl(id: string, compact = false): HTMLElement {
  const cur = getState().status[id] ?? "notStarted";
  const opts: Status[] = ["notStarted", "inProgress", "done"];
  return h("div", { class: `seg ${compact ? "seg-compact" : ""}`, role: "group", "aria-label": "Status" },
    opts.map((o) => h("button", { type: "button", class: o === cur ? "on" : "", "aria-pressed": o === cur,
      onclick: (e: Event) => { e.stopPropagation(); setStatus(id, o); } }, STATUS_LABEL[o])));
}

export function statusSelect(id: string): HTMLElement {
  const cur = getState().status[id] ?? "notStarted";
  return h("select", { class: "status-select", "aria-label": "Status", onchange: (e: Event) => setStatus(id, (e.target as HTMLSelectElement).value as Status) },
    (["notStarted", "inProgress", "done"] as Status[]).map((o) => h("option", { value: o, selected: o === cur }, STATUS_LABEL[o])));
}

export function why(sc: Scored): string[] {
  const { result, profile } = { result: getState().result, profile: getState().profile };
  const data = getData();
  const goalTitle = (g: string) => `${g} ${data.goals.find((x) => x.id === g)?.title ?? ""}`.trim();
  const out: string[] = [];
  if (sc.topGoals.length) {
    const ws = sc.topGoals.map((g) => `${goalTitle(g)} (${pct(result.goalWeights[g] ?? 0)} of your weighting)`);
    out.push(`Contributes most to ${ws.join(" and ")}.`);
  }
  if (sc.gap > 0) out.push(`Its domain, ${sc.action.domain}, has a maturity gap (${profile.current[sc.action.domain]} → ${profile.target[sc.action.domain]}), which raises its need.`);
  if (sc.legalFactor > 1.001) out.push(`Linked to legally binding EU AI Act requirements that apply to this profile (+${pct(sc.legalFactor - 1)}).`);
  if (sc.enabledCount > 0) out.push(`Unlocks ${sc.enabledCount} later action${sc.enabledCount === 1 ? "" : "s"} through the dependency chain.`);
  out.push(sc.effortSource === "expert" ? "Effort is based on expert ratings."
    : "Effort is a placeholder, not yet rated by experts.");
  return out;
}

export function drawer(): { el: HTMLElement; update: () => void } {
  const el = h("aside", { class: "drawer", "aria-label": "Action details", hidden: true });
  const update = () => {
    const st = getState();
    if (!st.selected) { el.hidden = true; replace(el); return; }
    const sc = st.result.byId.get(st.selected);
    if (!sc) { el.hidden = true; return; }
    el.hidden = false;
    replace(el, body(sc));
  };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && getState().selected) select(null); });
  return { el, update };
}

function ref(id: string): HTMLElement {
  const sc = getState().result.byId.get(id);
  const a = getData().actions.find((x) => x.id === id);
  const st = sc ? (sc.status === "done" ? " (done)" : sc.horizon ? ` · H${sc.horizon}` : "") : "";
  return h("button", { type: "button", class: "ref", onclick: () => select(id) },
    h("b", null, id), " ", a?.title ?? "", h("span", { class: "dim" }, st));
}

function body(sc: Scored): HTMLElement {
  const data = getData();
  const st = getState();
  const a = sc.action;
  const reqs = data.links.filter((l) => l.actionId === a.id).map((l) => ({ l, r: data.requirements.find((r) => r.id === l.requirementId)! })).filter((x) => x.r);
  const goals = data.goalLinks.filter((l) => l.actionId === a.id).map((l) => ({ l, g: data.goals.find((g) => g.id === l.goalId)! }));
  const byFw = (fw: string) => reqs.filter((x) => x.r.framework === fw);

  return h("div", { class: "drawer-in" },
    h("div", { class: "drawer-head" },
      h("div", null,
        h("span", { class: "id" }, a.id),
        h("span", { class: `chip lvl-${a.level.toLowerCase()}` }, a.level),
        h("span", { class: "chip" }, a.domain)),
      h("button", { type: "button", class: "icon-btn", "aria-label": "Close", onclick: () => select(null) }, "✕")),
    h("h2", null, a.title),
    statusControl(a.id),
    sc.active ? h("dl", { class: "facts" },
      h("div", null, h("dt", null, "Roadmap"), h("dd", null, `#${sc.sequence} · ${HORIZON_LABEL[(sc.horizon ?? 1) - 1]}`)),
      h("div", null, h("dt", null, "Priority rank"), h("dd", null, `${sc.rank} of ${st.result.scored.filter((x) => x.active).length}`)),
      h("div", null, h("dt", null, "Value"), h("dd", null, f2(sc.value))),
      h("div", null, h("dt", null, "Effort"), h("dd", null, `${f1(sc.effort)} ${sc.effortSource === "placeholder" ? "(placeholder)" : "(expert)"}`)),
      h("div", null, h("dt", null, "Dependency layer"), h("dd", null, String(sc.layer))),
      h("div", null, h("dt", null, "Quadrant"), h("dd", null, sc.quadrant ?? "–")),
    ) : h("p", { class: "note" }, sc.inactiveReason === "Done" ? "Marked as done: it no longer appears on the roadmap and no longer blocks other actions." : `Not on the roadmap: ${sc.inactiveReason}.`),
    sc.active ? h("section", null, h("h3", null, "Why it sits here"), h("ul", { class: "plain" }, why(sc).map((t) => h("li", null, t)))) : null,
    h("section", null, h("h3", null, "Needs first"),
      sc.prerequisites.length ? h("div", { class: "refs" }, sc.prerequisites.map(ref)) : h("p", { class: "dim" }, "Nothing in the action list. It can start straight away."),
      a.externalPrerequisitesNl.length ? h("details", null, h("summary", null, "Other prerequisites named in the workbook (Dutch)"), h("ul", { class: "plain" }, a.externalPrerequisitesNl.map((t) => h("li", null, t)))) : null),
    sc.enables.length ? h("section", null, h("h3", null, "Opens up"), h("div", { class: "refs" }, sc.enables.map(ref))) : null,
    h("section", null, h("h3", null, "Evidence and owner"),
      h("p", null, h("b", null, "Minimum evidence: "), a.evidence), h("p", null, h("b", null, "Owner: "), a.owner)),
    h("section", null, h("h3", null, `Requirements it supports (${reqs.length})`),
      FRAMEWORKS.map((fw) => {
        const rows = byFw(fw);
        if (!rows.length) return null;
        return h("div", { class: "fw-block" }, h("h4", null, fw),
          h("ul", { class: "plain req-list" }, rows.map(({ l, r }) => h("li", null,
            h("b", null, r.code), " ", r.title, " ",
            h("span", { class: `chip ob-${r.obligation}` }, OBLIGATION_LABEL[r.obligation]),
            l.validated ? h("span", { class: "chip ok" }, "validated") : h("span", { class: "chip" }, STRENGTH_LABEL[l.strength])))));
      })),
    h("section", null, h("h3", null, "Enterprise goals"),
      h("ul", { class: "plain" }, goals.map(({ l, g }) => h("li", null, h("b", null, g.id), " ", g.title,
        h("span", { class: "dim" }, ` · your weight ${pct(st.result.goalWeights[g.id] ?? 0)}, link strength ${l.strength}`))))),
    h("section", null, h("h3", null, "Source text (Dutch)"),
      h("p", { class: "nl" }, a.titleNl),
      h("details", null, h("summary", null, "How to implement it (workbook, Dutch)"),
        a.mechanismsNl ? h("dl", { class: "mech" }, Object.entries(a.mechanismsNl).filter(([, v]) => v).map(([k, v]) => h("div", null, h("dt", null, k), h("dd", null, String(v))))) : h("p", null, "–")),
      h("p", { class: "dim" }, `Provenance: ${a.source}, ${a.validated ? "expert-validated" : "not yet validated"}. English text: ${a.translationStatus}.`)),
  );
}
