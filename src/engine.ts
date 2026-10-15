import type {
  Action, CoverageRow, DataSet, OrgSize, Params, Profile, Requirement, Result, Scored, Status,
} from "./types.js";

export const SIZE_RANK: Record<OrgSize, number> = { small: 0, medium: 1, large: 2 };

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function goalWeights(importance: Record<string, number>, goalIds: string[]): Record<string, number> {
  const sum = goalIds.reduce((t, g) => t + (importance[g] ?? 0), 0);
  const w: Record<string, number> = {};
  for (const g of goalIds) w[g] = sum > 0 ? (importance[g] ?? 0) / sum : 1 / goalIds.length;
  return w;
}

export function requirementApplicable(r: Requirement, p: Pick<Profile, "role" | "risk">): boolean {
  const roleOk = r.role === "any" || p.role === "both" || p.role === "unknown" || p.role === r.role;
  const riskOk = r.risk === "any" || p.risk === "high" || p.risk === "unknown";
  return roleOk && riskOk;
}

interface Graph {
  succ: Map<string, Set<string>>;
  pred: Map<string, Set<string>>;
  order: string[];            // topological order (prerequisites first)
  warnings: string[];
}

/** Build an acyclic graph from edges; edges that would close a cycle are dropped and reported. */
function buildGraph(nodes: string[], edges: [string, string][]): Graph {
  const succ = new Map<string, Set<string>>(nodes.map((n) => [n, new Set<string>()]));
  const pred = new Map<string, Set<string>>(nodes.map((n) => [n, new Set<string>()]));
  for (const [a, b] of edges) {
    if (a === b || !succ.has(a) || !succ.has(b)) continue;
    succ.get(a)!.add(b);
    pred.get(b)!.add(a);
  }
  const warnings: string[] = [];
  const state = new Map<string, number>(); // 1 = visiting, 2 = done
  const order: string[] = [];
  const dfs = (u: string) => {
    state.set(u, 1);
    for (const v of [...succ.get(u)!]) {
      if (state.get(v) === 1) {
        succ.get(u)!.delete(v);
        pred.get(v)!.delete(u);
        warnings.push(`Circular dependency: ${u} -> ${v} was ignored.`);
      } else if (!state.has(v)) dfs(v);
    }
    state.set(u, 2);
    order.push(u);
  };
  for (const n of nodes) if (!state.has(n)) dfs(n);
  order.reverse(); // reverse post-order = prerequisites first
  return { succ, pred, order, warnings };
}

/** Remove edges that are implied by a longer path (transitive reduction of a DAG). */
function reduce(g: Graph): Graph {
  const reach = new Map<string, Set<string>>();
  for (const u of [...g.order].reverse()) {
    const r = new Set<string>();
    for (const v of g.succ.get(u)!) { r.add(v); for (const x of reach.get(v)!) r.add(x); }
    reach.set(u, r);
  }
  const succ = new Map<string, Set<string>>();
  const pred = new Map<string, Set<string>>(g.order.map((n) => [n, new Set<string>()]));
  for (const u of g.order) {
    const keep = new Set<string>();
    for (const v of g.succ.get(u)!) {
      let redundant = false;
      for (const w of g.succ.get(u)!) if (w !== v && reach.get(w)!.has(v)) { redundant = true; break; }
      if (!redundant) { keep.add(v); pred.get(v)!.add(u); }
    }
    succ.set(u, keep);
  }
  return { succ, pred, order: g.order, warnings: g.warnings };
}

function progress(s: Status): number { return s === "done" ? 1 : s === "inProgress" ? 0.5 : 0; }

export function compute(data: DataSet, profile: Profile, status: Record<string, Status>): Result {
  const P: Params = profile.params;
  const warnings: string[] = [];
  const st = (id: string): Status => status[id] ?? "notStarted";
  const reqById = new Map(data.requirements.map((r) => [r.id, r]));

  // ---- which actions take part
  const eligible = new Set<string>();
  for (const a of data.actions) {
    if (!(a.inScope || profile.includeTechnical)) continue;
    if (SIZE_RANK[profile.orgSize] < SIZE_RANK[a.minOrgSize]) continue;
    eligible.add(a.id);
  }
  const active = new Set([...eligible].filter((id) => st(id) !== "done"));
  const nodes = data.actions.map((a) => a.id).filter((id) => active.has(id));

  // ---- dependency graph on active actions (prerequisites that are done no longer constrain anything)
  const hardEdges: [string, string][] = [];
  const softEdges: [string, string][] = [];
  for (const d of data.dependencies) {
    if (!active.has(d.from) || !active.has(d.to)) continue;
    (d.type === "hard" ? hardEdges : softEdges).push([d.from, d.to]);
  }
  const full = buildGraph(nodes, hardEdges);
  warnings.push(...full.warnings);
  const red = reduce(full);

  // layers = longest chain of hard prerequisites
  const layer = new Map<string, number>();
  for (const n of full.order) {
    let l = 1;
    for (const p of full.pred.get(n)!) l = Math.max(l, (layer.get(p) ?? 1) + 1);
    layer.set(n, l);
  }

  // ---- goals and impact
  const goalIds = data.goals.map((g) => g.id);
  const gw = goalWeights(profile.importance, goalIds);
  const impactRaw = new Map<string, number>();
  const topGoals = new Map<string, string[]>();
  const perAction = new Map<string, { goalId: string; contribution: number }[]>();
  for (const l of data.goalLinks) {
    if (!perAction.has(l.actionId)) perAction.set(l.actionId, []);
    perAction.get(l.actionId)!.push({ goalId: l.goalId, contribution: (gw[l.goalId] ?? 0) * l.strength });
  }
  for (const id of nodes) {
    const c = perAction.get(id) ?? [];
    impactRaw.set(id, c.reduce((t, x) => t + x.contribution, 0));
    topGoals.set(id, [...c].sort((a, b) => b.contribution - a.contribution).slice(0, 2).map((x) => x.goalId));
  }
  const maxImpact = Math.max(0, ...nodes.map((n) => impactRaw.get(n)!));

  // ---- maturity gap, legal factor, need
  const gapOf = (domain: string) => Math.max(0, ((profile.target[domain] ?? 3) - (profile.current[domain] ?? 2)) / 4);
  const linksByAction = new Map<string, string[]>();
  for (const l of data.links) {
    if (!linksByAction.has(l.actionId)) linksByAction.set(l.actionId, []);
    linksByAction.get(l.actionId)!.push(l.requirementId);
  }
  const actionById = new Map(data.actions.map((a) => [a.id, a]));
  const legal = new Map<string, number>();
  const needRaw = new Map<string, number>();
  for (const id of nodes) {
    const nBinding = (linksByAction.get(id) ?? [])
      .map((rid) => reqById.get(rid)!)
      .filter((r) => r && r.obligation === "binding" && requirementApplicable(r, profile)).length;
    const lf = 1 + P.legalBoost * Math.min(1, nBinding / 3);
    legal.set(id, lf);
    const impactNorm = maxImpact > 0 ? impactRaw.get(id)! / maxImpact : 0;
    needRaw.set(id, impactNorm * (1 + P.beta * gapOf(actionById.get(id)!.domain)) * lf);
  }
  const maxNeed = Math.max(0, ...nodes.map((n) => needRaw.get(n)!));
  const needNorm = new Map(nodes.map((n) => [n, maxNeed > 0 ? needRaw.get(n)! / maxNeed : 0]));

  // ---- enabling value: what an action unlocks further down the (reduced) hard dependency graph
  const enablingRaw = new Map<string, number>();
  const enabledCount = new Map<string, number>();
  const softSucc = new Map<string, string[]>();
  for (const [a, b] of softEdges) { if (!softSucc.has(a)) softSucc.set(a, []); softSucc.get(a)!.push(b); }
  for (const id of nodes) {
    const dist = new Map<string, number>([[id, 0]]);
    const queue = [id];
    let sum = 0;
    while (queue.length) {
      const u = queue.shift()!;
      const d = dist.get(u)!;
      if (d >= P.maxDepth) continue;
      for (const v of red.succ.get(u)!) {
        if (dist.has(v)) continue;
        dist.set(v, d + 1);
        sum += Math.pow(P.decay, d + 1) * needNorm.get(v)!;
        queue.push(v);
      }
    }
    for (const v of softSucc.get(id) ?? []) {
      if (!dist.has(v)) { dist.set(v, 1); sum += P.softEdgeWeight * P.decay * needNorm.get(v)!; }
    }
    enablingRaw.set(id, sum);
    enabledCount.set(id, dist.size - 1);
  }
  const maxEnabling = Math.max(0, ...nodes.map((n) => enablingRaw.get(n)!));

  // ---- value, effort, priority
  const expert = data.expert?.actions ?? {};
  const scoredMap = new Map<string, Scored>();
  for (const a of data.actions) {
    const isActive = active.has(a.id);
    const ex = expert[a.id];
    const useExpert = !!ex && (ex.raters ?? 0) >= P.minRaters && typeof ex.effortMedian === "number";
    const baseEffort = useExpert ? ex!.effortMedian! : a.baseEffort;
    const mat = Math.min(5, Math.max(1, Math.round(profile.current[a.domain] ?? 2)));
    const effort = baseEffort * P.sizeMult[profile.orgSize] * P.maturityMod[mat - 1];
    const s: Status = st(a.id);
    const remaining = effort * (s === "inProgress" ? P.inProgressFactor : 1);
    const enablingNorm = maxEnabling > 0 && isActive ? enablingRaw.get(a.id)! / maxEnabling : 0;
    const nn = isActive ? needNorm.get(a.id)! : 0;
    const value = isActive ? (nn + P.lambda * enablingNorm) / (1 + P.lambda) : 0;
    scoredMap.set(a.id, {
      action: a, active: isActive,
      inactiveReason: isActive ? null : !eligible.has(a.id)
        ? (a.inScope ? "Below the minimum organisation size" : "Technical action (excluded by the profile)")
        : "Done",
      impact: isActive ? (maxImpact > 0 ? impactRaw.get(a.id)! / maxImpact : 0) : 0,
      gap: gapOf(a.domain),
      legalFactor: legal.get(a.id) ?? 1,
      need: nn, enabling: enablingNorm, enabledCount: enabledCount.get(a.id) ?? 0,
      value, effort, effortSource: useExpert ? "expert" : "placeholder", remainingEffort: remaining,
      priority: isActive && remaining > 0 ? value / remaining : 0, priorityIndex: 0,
      rank: null, quadrant: null, layer: layer.get(a.id) ?? 0, effectivePriority: 0,
      sequence: null, horizon: null,
      topGoals: topGoals.get(a.id) ?? [],
      prerequisites: [...(full.pred.get(a.id) ?? [])].sort(),
      enables: [...(red.succ.get(a.id) ?? [])].sort(),
      status: s,
    });
  }
  const act = nodes.map((n) => scoredMap.get(n)!);
  const maxPriority = Math.max(0, ...act.map((s) => s.priority));
  for (const s of act) s.priorityIndex = maxPriority > 0 ? (s.priority / maxPriority) * 100 : 0;
  [...act].sort((a, b) => b.priority - a.priority || a.action.id.localeCompare(b.action.id)).forEach((s, i) => (s.rank = i + 1));

  const medianValue = median(act.map((s) => s.value));
  const medianEffort = median(act.map((s) => s.effort));
  const minEffort = Math.min(...act.map((s) => s.effort));
  for (const s of act) {
    // "low effort" = below the median; if most actions share the lowest effort, those count as low
    const hi = s.value >= medianValue;
    const lo = s.effort < medianEffort || (medianEffort === minEffort && s.effort === minEffort);
    s.quadrant = hi && lo ? "Quick win" : hi ? "Major project" : lo ? "Fill-in" : "Defer";
  }

  // ---- sequence: a prerequisite inherits the priority of everything that depends on it
  for (const n of [...full.order].reverse()) {
    const s = scoredMap.get(n)!;
    let ep = s.priorityIndex;
    for (const v of full.succ.get(n)!) ep = Math.max(ep, scoredMap.get(v)!.effectivePriority);
    s.effectivePriority = ep;
  }
  const seq = [...act].sort((a, b) =>
    b.effectivePriority - a.effectivePriority || a.layer - b.layer || b.priorityIndex - a.priorityIndex || a.action.id.localeCompare(b.action.id));
  const cap = P.capacity[profile.orgSize];
  const horizonEffort = [0, 0, 0, 0];
  let cum = 0;
  seq.forEach((s, i) => {
    s.sequence = i + 1;
    cum += s.remainingEffort;
    s.horizon = cum <= cap ? 1 : cum <= 2 * cap ? 2 : cum <= 4 * cap ? 3 : 4;
    horizonEffort[s.horizon - 1] += s.remainingEffort;
  });
  for (const s of seq) for (const p of s.prerequisites) {
    const ps = scoredMap.get(p)!;
    if ((ps.sequence ?? 0) > (s.sequence ?? 0)) warnings.push(`Sequence error: ${p} scheduled after ${s.action.id}.`);
  }

  // ---- coverage per requirement
  const actionsByReq = new Map<string, { actionId: string; strength: string }[]>();
  for (const l of data.links) {
    if (!eligible.has(l.actionId)) continue;
    if (!actionsByReq.has(l.requirementId)) actionsByReq.set(l.requirementId, []);
    actionsByReq.get(l.requirementId)!.push({ actionId: l.actionId, strength: l.strength });
  }
  const coverage: CoverageRow[] = [];
  for (const r of data.requirements) {
    if (!r.linkable) continue;
    const linked = actionsByReq.get(r.id) ?? [];
    const w = (strength: string) => P.strengthWeight[strength as keyof Params["strengthWeight"]] ?? 0.5;
    const total = linked.reduce((t, x) => t + w(x.strength), 0);
    const cov = (extra: (id: string) => number) =>
      total > 0 ? linked.reduce((t, x) => t + w(x.strength) * extra(x.actionId), 0) / total : 0;
    const now = cov((id) => progress(st(id)));
    const projected = [1, 2, 3, 4].map((h) =>
      cov((id) => { const s = scoredMap.get(id)!; return s.active && s.horizon !== null && s.horizon <= h ? 1 : progress(st(id)); }));
    const applicable = requirementApplicable(r, profile);
    const isGap = linked.length === 0;
    coverage.push({
      req: r, applicable, actionIds: linked.map((x) => x.actionId),
      primaryCount: linked.filter((x) => x.strength === "primary").length,
      coverage: now, projected, gap: isGap, fragile: !isGap && linked.length <= 1,
      rag: !applicable ? "none" : isGap ? "red" : now === 0 ? "none" : now >= P.coverageGreen ? "green" : now >= P.coverageAmber ? "amber" : "red",
    });
  }

  return { scored: data.actions.map((a) => scoredMap.get(a.id)!), byId: scoredMap, goalWeights: gw, medianValue, medianEffort, horizonEffort, coverage, warnings };
}

export function activeSorted(r: Result): Scored[] {
  return r.scored.filter((s) => s.active).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
}

export function actionTitle(a: Action): string { return a.title; }
