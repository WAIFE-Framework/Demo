export function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    applyAttrs(el, attrs);
    append(el, children);
    return el;
}
const SVG_NS = "http://www.w3.org/2000/svg";
export function s(tag, attrs, ...children) {
    const el = document.createElementNS(SVG_NS, tag);
    applyAttrs(el, attrs);
    append(el, children);
    return el;
}
function applyAttrs(el, attrs) {
    if (!attrs)
        return;
    for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null || v === false)
            continue;
        if (k === "class")
            el.setAttribute("class", String(v));
        else if (k === "style" && typeof v === "object")
            Object.assign(el.style, v);
        else if (k.startsWith("on") && typeof v === "function")
            el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === "value" && "value" in el)
            el.value = String(v);
        else if (k === "checked" && "checked" in el)
            el.checked = !!v;
        else if (k === "selected" && "selected" in el)
            el.selected = !!v;
        else if (k === "disabled" && "disabled" in el)
            el.disabled = !!v;
        else
            el.setAttribute(k, v === true ? "" : String(v));
    }
}
function append(el, children) {
    for (const c of children) {
        if (c === null || c === undefined || c === false)
            continue;
        if (Array.isArray(c))
            append(el, c);
        else
            el.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
    }
}
export function clear(el) { while (el.firstChild)
    el.removeChild(el.firstChild); }
export function replace(el, ...children) { clear(el); append(el, children); }
export const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
export const f1 = (x) => x.toFixed(1);
export const f2 = (x) => x.toFixed(2);
export const HORIZON_LABEL = ["0–3 months", "3–6 months", "6–12 months", "12+ months"];
export const FRAMEWORKS = ["ISO 38507", "ISO 42001", "NIST AI RMF", "EU AI Act"];
export const OBLIGATION_LABEL = {
    binding: "Legally binding", certifiable: "Certifiable standard", guidance: "Guidance", voluntary: "Voluntary framework",
};
export const STATUS_LABEL = { notStarted: "Not started", inProgress: "In progress", done: "Done" };
export const STRENGTH_LABEL = { primary: "Primary", supporting: "Supporting", toAssess: "To assess" };
export function download(name, text, type = "text/csv") {
    const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
    const a = h("a", { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csv(rows) {
    return rows.map((r) => r.map((c) => {
        const t = c === null || c === undefined ? "" : String(c);
        return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    }).join(",")).join("\n");
}
