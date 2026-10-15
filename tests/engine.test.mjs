// Run with: npm test   (compiles with tsc, then node --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compute, goalWeights, activeSorted } from "../docs/js/engine.js";
import { DEFAULT_PARAMS, SCENARIOS, makeProfile } from "../docs/js/defaults.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// ---------- hand-calculated toy example
function toy() {
  const mk = (id, extra = {}) => ({ id, domain: "D", title: id, level: "Managerial", inScope: true, minOrgSize: "small",
    baseEffort: 2, owner: "x", evidence: "", mechanism: "Process", ...extra });
  return {
    actions: [mk("A"), mk("B"), mk("C")],
    goals: [{ id: "g1", title: "g1", perspective: "" }, { id: "g2", title: "g2", perspective: "" }],
    domains: ["D"], requirements: [], links: [],
    goalLinks: [
      { actionId: "A", goalId: "g1", strength: 1 }, { actionId: "B", goalId: "g2", strength: 1 },
      { actionId: "C", goalId: "g1", strength: 1 }, { actionId: "C", goalId: "g2", strength: 1 },
    ],
    dependencies: [{ from: "A", to: "B", type: "hard" }, { from: "B", to: "C", type: "hard" }, { from: "A", to: "C", type: "hard" }],
    expert: { actions: {}, links: {}, dependencies: {} },
  };
}
const toyProfile = () => ({
  scenarioId: "t", orgSize: "medium", role: "both", risk: "unknown",
  importance: { g1: 3, g2: 1 }, current: { D: 2 }, target: { D: 2 }, includeTechnical: false,
  params: structuredClone(DEFAULT_PARAMS),
});

test("toy example matches the hand calculation", () => {
  const r = compute(toy(), toyProfile(), {});
  near(r.goalWeights.g1, 0.75); near(r.goalWeights.g2, 0.25);
  const A = r.byId.get("A"), B = r.byId.get("B"), C = r.byId.get("C");
  near(A.need, 0.75); near(B.need, 0.25); near(C.need, 1);
  // A -> B -> C (the direct A -> C edge is redundant and must not count twice)
  near(A.enabling, 0.375 / 0.5); near(B.enabling, 1); near(C.enabling, 0);
  near(A.value, 0.75); near(B.value, 0.5); near(C.value, 1 / 1.5);
  near(A.effort, 2 * 1.0 * 1.15);
  assert.deepEqual([A.layer, B.layer, C.layer], [1, 2, 3]);
  assert.deepEqual(A.enables, ["B"]);          // reduced graph
  assert.deepEqual(C.prerequisites, ["A", "B"]); // full graph kept for display
});

test("a prerequisite is never scheduled after its dependent, even if the dependent scores higher", () => {
  const r = compute(toy(), toyProfile(), {});
  const order = activeSorted(r).map((s) => s.action.id);
  assert.deepEqual(order, ["A", "B", "C"]);
  assert.ok(r.byId.get("C").priorityIndex > r.byId.get("B").priorityIndex); // C scores higher on its own
});

test("done actions leave the roadmap and release their dependents", () => {
  const r = compute(toy(), toyProfile(), { A: "done" });
  assert.equal(r.byId.get("A").active, false);
  assert.equal(r.byId.get("B").layer, 1);
  assert.deepEqual(r.byId.get("B").prerequisites, []);
});

test("cycles are reported and do not crash", () => {
  const d = toy();
  d.dependencies.push({ from: "C", to: "A", type: "hard" });
  const r = compute(d, toyProfile(), {});
  assert.ok(r.warnings.some((w) => w.startsWith("Circular dependency")));
  assert.equal(activeSorted(r).length, 3);
});

test("goal weights are normalised", () => {
  const w = goalWeights({ a: 5, b: 5, c: 0 }, ["a", "b", "c"]);
  near(w.a + w.b + w.c, 1); near(w.c, 0);
});

test("expert effort replaces the placeholder only with enough raters", () => {
  const d = toy();
  d.expert.actions.A = { effortMedian: 5, raters: 2 };
  d.expert.actions.B = { effortMedian: 5, raters: 3 };
  const r = compute(d, toyProfile(), {});
  assert.equal(r.byId.get("A").effortSource, "placeholder");
  assert.equal(r.byId.get("B").effortSource, "expert");
  near(r.byId.get("B").effort, 5 * 1.15);
});

// ---------- the real data set
const load = (n) => JSON.parse(readFileSync(new URL(`../src/data/${n}.json`, import.meta.url)));
const data = Object.fromEntries(["meta", "actions", "goals", "domains", "requirements", "links", "goalLinks", "dependencies", "review", "expert"].map((n) => [n, load(n)]));

for (const sc of SCENARIOS) {
  test(`real data, scenario "${sc.id}": invariants hold`, () => {
    const profile = makeProfile(sc, data);
    const r = compute(data, profile, {});
    assert.deepEqual(r.warnings, []);
    near(Object.values(r.goalWeights).reduce((a, b) => a + b, 0), 1);
    const act = activeSorted(r);
    assert.equal(act.length, data.actions.filter((a) => a.inScope).length);
    const ranks = act.map((s) => s.rank);
    assert.equal(new Set(ranks).size, act.length);
    for (const s of act) {
      assert.ok(s.value >= 0 && s.value <= 1 + 1e-9, `value ${s.value}`);
      assert.ok(s.horizon >= 1 && s.horizon <= 4);
      for (const p of s.prerequisites) {
        const ps = r.byId.get(p);
        assert.ok(ps.sequence < s.sequence, `${p} must precede ${s.action.id}`);
        assert.ok(ps.horizon <= s.horizon);
        assert.ok(ps.layer < s.layer);
      }
    }
    // horizons are filled in order
    for (let i = 1; i < act.length; i++) assert.ok(act[i].horizon >= act[i - 1].horizon);
  });
}

test("changing goal importance changes the ranking", () => {
  const base = makeProfile(SCENARIOS[0], data);
  const a = compute(data, base, {});
  const b = compute(data, { ...base, importance: { ...base.importance, EG01: 5, EG13: 5, EG02: 1, EG03: 1 } }, {});
  const top = (r) => activeSorted(r).sort((x, y) => x.rank - y.rank).slice(0, 10).map((s) => s.action.id).join();
  assert.notEqual(top(a), top(b));
});

test("EU role/risk applicability affects coverage applicability and legal weight", () => {
  const base = makeProfile(SCENARIOS[0], data);
  const hi = compute(data, { ...base, role: "provider", risk: "high" }, {});
  const lo = compute(data, { ...base, role: "deployer", risk: "nothigh" }, {});
  const cl = (r, id) => r.coverage.find((c) => c.req.id === id);
  assert.equal(cl(hi, "EUAIA-EU10").applicable, true);   // provider conformity: applies
  assert.equal(cl(lo, "EUAIA-EU10").applicable, false);  // not for a deployer without high-risk
  assert.equal(cl(lo, "EUAIA-EU04").applicable, true);   // AI literacy: always
});
