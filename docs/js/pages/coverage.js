import { bar } from "../charts.js";
import { getData, getState, select } from "../store.js";
import { FRAMEWORKS, HORIZON_LABEL, OBLIGATION_LABEL, STATUS_LABEL, csv, download, h, pct, replace } from "../ui.js";
export function coveragePage() {
    const data = getData();
    let fw = "all";
    let onlyGaps = false;
    let onlyApplicable = true;
    const open = new Set();
    const cards = h("div", { class: "fw-cards" });
    const filters = h("div", { class: "filters" });
    const tableBox = h("div", { class: "table-wrap" });
    const el = h("div", { class: "page" }, h("h1", null, "Coverage by framework"), h("p", { class: "lead" }, "For every requirement: which actions serve it and how far those actions have come. Mark actions as in progress or done on the Roadmap page and this view follows."), h("p", { class: "note strong" }, "Coverage measures progress of the mapped governance actions. It is an alignment indication, not proof of legal compliance or certification."), cards, filters, tableBox);
    const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    function renderCards() {
        const rows = getState().result.coverage;
        replace(cards, FRAMEWORKS.map((f) => {
            const r = rows.filter((x) => x.req.framework === f && x.applicable);
            const gaps = r.filter((x) => x.gap).length;
            return h("button", { type: "button", class: `fw-card ${fw === f ? "on" : ""}`, onclick: () => { fw = fw === f ? "all" : f; render(); } }, h("h3", null, f), h("div", { class: "big" }, pct(avg(r.map((x) => x.coverage)))), h("span", { class: "dim" }, "average coverage now"), h("div", { class: "cov-line" }, bar(avg(r.map((x) => x.projected[1]))), h("span", null, `${pct(avg(r.map((x) => x.projected[1])))} by month 6`)), h("ul", { class: "plain small" }, h("li", null, `${r.length} requirements apply`), h("li", null, `${gaps} without any action`), h("li", null, `${r.filter((x) => x.fragile).length} served by one action only`)));
        }));
    }
    function renderFilters() {
        replace(filters, h("label", { class: "check" }, h("input", { type: "checkbox", checked: onlyApplicable, onchange: (e) => { onlyApplicable = e.target.checked; render(); } }), " Only requirements that apply to my role and risk profile"), h("label", { class: "check" }, h("input", { type: "checkbox", checked: onlyGaps, onchange: (e) => { onlyGaps = e.target.checked; render(); } }), " Only requirements without an action"), h("button", { type: "button", class: "btn", onclick: exportCsv }, "Download CSV"));
    }
    function filtered() {
        return getState().result.coverage.filter((c) => (fw === "all" || c.req.framework === fw) && (!onlyApplicable || c.applicable) && (!onlyGaps || c.gap));
    }
    function renderTable() {
        const st = getState();
        const rows = filtered();
        const body = rows.flatMap((c) => {
            const isOpen = open.has(c.req.id);
            const main = h("tr", { class: `cov-row rag-${c.rag}`, tabindex: 0, "aria-expanded": isOpen,
                onclick: () => { if (isOpen)
                    open.delete(c.req.id);
                else
                    open.add(c.req.id); renderTable(); },
                onkeydown: (e) => { if (e.key === "Enter") {
                    if (isOpen)
                        open.delete(c.req.id);
                    else
                        open.add(c.req.id);
                    renderTable();
                } } }, h("td", null, c.req.framework), h("td", null, h("b", null, c.req.code)), h("td", { class: "t-title" }, c.req.title), h("td", null, h("span", { class: `chip ob-${c.req.obligation}` }, OBLIGATION_LABEL[c.req.obligation])), h("td", null, String(c.actionIds.length)), h("td", null, h("div", { class: "cov-line" }, bar(c.coverage, `rag-${c.rag}`), h("span", null, pct(c.coverage)))), h("td", null, pct(c.projected[1])), h("td", null, pct(c.projected[3])), h("td", null, c.gap ? h("span", { class: "chip bad" }, "no action") : c.fragile ? h("span", { class: "chip warn" }, "one action") : !c.applicable ? h("span", { class: "chip" }, "not applicable") : ""));
            if (!isOpen)
                return [main];
            const detail = h("tr", { class: "cov-detail" }, h("td", { colspan: 9 }, c.req.workbookCoverage ? h("p", { class: "note" }, `Workbook assessment: ${c.req.workbookCoverage}. Remaining difference: ${c.req.workbookRemaining ?? "–"} (Dutch)`) : null, c.actionIds.length ? h("ul", { class: "plain" }, c.actionIds.map((id) => {
                const sc = st.result.byId.get(id);
                return h("li", null, h("button", { type: "button", class: "ref", onclick: (e) => { e.stopPropagation(); select(id); } }, h("b", null, id), " ", sc.action.title), h("span", { class: "dim" }, ` · ${STATUS_LABEL[sc.status]}${sc.horizon ? ` · ${HORIZON_LABEL[sc.horizon - 1]}` : ""}`));
            })) : h("p", { class: "empty-state" }, "No action in the current set serves this requirement. This is a gap in the action list, not necessarily a gap in your organisation.")));
            return [main, detail];
        });
        replace(tableBox, h("table", { class: "data" }, h("thead", null, h("tr", null, ["Framework", "Code", "Requirement", "Type", "Actions", "Coverage now", "By month 6", "When all planned", "Flag"].map((t) => h("th", null, t)))), h("tbody", null, body)), rows.length ? null : h("p", { class: "empty-state" }, "Nothing matches these filters."));
    }
    function exportCsv() {
        const rows = [["Framework", "Code", "Requirement", "Obligation", "Applicable", "Actions", "CoverageNow", "CoverageAfterH2", "CoverageAfterH4", "Gap", "OneActionOnly", "ActionIDs"]];
        for (const c of filtered())
            rows.push([c.req.framework, c.req.code, c.req.title, OBLIGATION_LABEL[c.req.obligation], c.applicable ? "yes" : "no", c.actionIds.length,
                +c.coverage.toFixed(3), +c.projected[1].toFixed(3), +c.projected[3].toFixed(3), c.gap ? "yes" : "no", c.fragile ? "yes" : "no", c.actionIds.join(" ")]);
        download("ai-governance-coverage.csv", csv(rows));
    }
    function render() { renderCards(); renderFilters(); renderTable(); }
    void data;
    render();
    return { el, update: () => { renderCards(); renderTable(); } };
}
