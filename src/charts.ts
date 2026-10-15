import type { Result, Scored } from "./types.js";
import { HORIZON_LABEL, h, s } from "./ui.js";

/** Value (y) against effort (x) for all active actions; dashed lines at the medians form the four quadrants. */
export function scatter(result: Result, onPick: (id: string) => void): HTMLElement {
  const act = result.scored.filter((x) => x.active);
  const W = 760, H = 460, m = { l: 56, r: 20, t: 20, b: 52 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const maxE = Math.max(1, ...act.map((x) => x.effort)) * 1.08;
  const minE = Math.min(...act.map((x) => x.effort), maxE) * 0.85;
  const x = (e: number) => m.l + ((e - minE) / (maxE - minE || 1)) * iw;
  const y = (v: number) => m.t + (1 - v) * ih;

  const wrap = h("div", { class: "chart" });
  const tip = h("div", { class: "tip", role: "status", hidden: true });
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "scatter", role: "img",
    "aria-label": "Scatter plot of value against effort for all active actions" });

  // grid + axes
  for (let v = 0; v <= 1.0001; v += 0.25) {
    svg.appendChild(s("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: "grid" }));
    svg.appendChild(s("text", { x: m.l - 8, y: y(v) + 4, class: "tick", "text-anchor": "end" }, v.toFixed(2)));
  }
  const xt = niceTicks(minE, maxE, 5);
  for (const t of xt) {
    svg.appendChild(s("text", { x: x(t), y: H - m.b + 18, class: "tick", "text-anchor": "middle" }, t.toFixed(1)));
    svg.appendChild(s("line", { x1: x(t), x2: x(t), y1: H - m.b, y2: H - m.b + 4, class: "axis" }));
  }
  svg.appendChild(s("line", { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: "axis" }));
  svg.appendChild(s("text", { x: m.l + iw / 2, y: H - 8, class: "axis-title", "text-anchor": "middle" }, "Effort (remaining effort points, lower is easier)"));
  svg.appendChild(s("text", { x: 14, y: m.t + ih / 2, class: "axis-title", "text-anchor": "middle", transform: `rotate(-90 14 ${m.t + ih / 2})` }, "Value (0–1)"));

  // medians and quadrant labels
  const mx = x(result.medianEffort), my = y(result.medianValue);
  svg.appendChild(s("line", { x1: mx, x2: mx, y1: m.t, y2: H - m.b, class: "median" }));
  svg.appendChild(s("line", { x1: m.l, x2: W - m.r, y1: my, y2: my, class: "median" }));
  const q = (label: string, px: number, py: number, anchor: string) =>
    svg.appendChild(s("text", { x: px, y: py, class: "qlabel", "text-anchor": anchor }, label));
  q("Quick wins", m.l + 8, m.t + 16, "start");
  q("Major projects", W - m.r - 8, m.t + 16, "end");
  q("Fill-ins", m.l + 8, H - m.b - 10, "start");
  q("Defer", W - m.r - 8, H - m.b - 10, "end");

  // points (deterministic jitter so equal-effort actions do not hide each other)
  const jitter = (id: string) => { let n = 0; for (const c of id) n = (n * 31 + c.charCodeAt(0)) % 997; return ((n % 21) - 10) / 10 * 5; };
  const pts = [...act].sort((a, b) => (b.horizon ?? 0) - (a.horizon ?? 0));
  for (const p of pts) {
    const cx = x(p.effort) + jitter(p.action.id), cy = y(p.value);
    const g = s("g", { class: `pt h${p.horizon}`, tabindex: 0, role: "button", "aria-label": `${p.action.id} ${p.action.title}` });
    g.appendChild(s("circle", { cx, cy, r: 11, class: "hit" }));
    g.appendChild(s("circle", { cx, cy, r: 5, class: "dot" }));
    const show = () => showTip(tip, wrap, p, cx / W, cy / H);
    g.addEventListener("mouseenter", show); g.addEventListener("focus", show);
    g.addEventListener("mouseleave", () => (tip.hidden = true)); g.addEventListener("blur", () => (tip.hidden = true));
    g.addEventListener("click", () => onPick(p.action.id));
    g.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter" || (e as KeyboardEvent).key === " ") { e.preventDefault(); onPick(p.action.id); } });
    svg.appendChild(g);
  }

  const legend = h("div", { class: "legend", "aria-label": "Colour = roadmap horizon" },
    [1, 2, 3, 4].map((i) => h("span", { class: "legend-item" }, h("i", { class: `swatch h${i}` }), HORIZON_LABEL[i - 1])));
  wrap.append(svg, tip, legend);
  return wrap;
}

function showTip(tip: HTMLElement, wrap: HTMLElement, p: Scored, fx: number, fy: number) {
  tip.hidden = false;
  tip.replaceChildren(
    h("strong", null, `${p.action.id} · ${p.action.domain}`),
    h("span", null, p.action.title),
    h("span", { class: "tip-meta" }, `Value ${p.value.toFixed(2)} · effort ${p.effort.toFixed(1)} · horizon ${p.horizon} · ${p.quadrant}`),
  );
  const left = fx > 0.6;
  tip.style.left = left ? "auto" : `${fx * 100}%`;
  tip.style.right = left ? `${(1 - fx) * 100}%` : "auto";
  tip.style.top = `${Math.min(fy * 100, 70)}%`;
  void wrap;
}

function niceTicks(lo: number, hi: number, n: number): number[] {
  const step = Math.max(0.5, Math.round(((hi - lo) / n) * 2) / 2);
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) out.push(t);
  return out;
}

/** A thin horizontal bar for coverage values. */
export function bar(value: number, cls = ""): HTMLElement {
  return h("span", { class: `bar ${cls}`, role: "img", "aria-label": `${Math.round(value * 100)} percent` },
    h("i", { style: { width: `${Math.max(0, Math.min(1, value)) * 100}%` } }));
}
