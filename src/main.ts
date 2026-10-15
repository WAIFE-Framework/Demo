import { drawer } from "./drawer.js";
import { coveragePage } from "./pages/coverage.js";
import { explorerPage } from "./pages/explorer.js";
import { methodPage } from "./pages/method.js";
import type { Page, PageFactory } from "./pages/page.js";
import { roadmapPage } from "./pages/roadmap.js";
import { getState, init, subscribe } from "./store.js";
import type { DataSet } from "./types.js";
import { h, replace } from "./ui.js";

declare global { interface Window { __DATA__?: DataSet } }

const ROUTES: { path: string; label: string; make: PageFactory }[] = [
  { path: "roadmap", label: "Roadmap", make: roadmapPage },
  { path: "explorer", label: "Explorer", make: explorerPage },
  { path: "coverage", label: "Coverage", make: coveragePage },
  { path: "method", label: "Method and data", make: methodPage },
];

async function loadData(): Promise<DataSet> {
  if (window.__DATA__) return window.__DATA__;
  const names = ["meta", "actions", "goals", "domains", "requirements", "links", "goalLinks", "dependencies", "review", "expert"];
  const parts = await Promise.all(names.map((n) => fetch(`data/${n}.json`).then((r) => { if (!r.ok) throw new Error(`${n}.json: ${r.status}`); return r.json(); })));
  return Object.fromEntries(names.map((n, i) => [n, parts[i]])) as unknown as DataSet;
}

function currentPath(): string {
  const p = location.hash.replace(/^#\/?/, "").split("?")[0];
  return ROUTES.some((r) => r.path === p) ? p : "roadmap";
}

async function start() {
  const app = document.getElementById("app")!;
  try {
    init(await loadData());
  } catch (e) {
    replace(app, h("div", { class: "page" }, h("h1", null, "The data could not be loaded"),
      h("p", null, String(e)), h("p", null, "If you opened index.html straight from disk, serve the folder over http instead, for example with “node scripts/serve.mjs”.")));
    return;
  }
  const nav = h("nav", { class: "nav", "aria-label": "Sections" });
  const main = h("main", { id: "main" });
  const dr = drawer();
  const backdrop = h("div", { class: "backdrop", hidden: true, onclick: () => import("./store.js").then((m) => m.select(null)) });
  replace(app,
    h("header", { class: "top" },
      h("a", { class: "brand", href: "#/roadmap" }, h("span", { class: "mark", "aria-hidden": "true" }), h("span", null, "AI governance roadmap")),
      nav),
    main, backdrop, dr.el);

  let page: Page | null = null;
  const mount = () => {
    const path = currentPath();
    replace(nav, ROUTES.map((r) => h("a", { href: `#/${r.path}`, "aria-current": r.path === path ? "page" : null }, r.label)));
    const route = ROUTES.find((r) => r.path === path)!;
    page = route.make();
    replace(main, page.el);
    page.update();
    main.scrollTop = 0; window.scrollTo(0, 0);
  };
  window.addEventListener("hashchange", mount);
  subscribe(() => {
    page?.update();
    dr.update();
    backdrop.hidden = !getState().selected;
    document.body.classList.toggle("drawer-open", !!getState().selected);
  });
  mount();
}

start();
