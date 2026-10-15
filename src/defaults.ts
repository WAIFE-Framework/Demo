import type { DataSet, OrgSize, Params, Profile, RiskClass, Role } from "./types.js";

export const DEFAULT_PARAMS: Params = {
  beta: 0.5,
  lambda: 0.5,
  decay: 0.5,
  softEdgeWeight: 0.5,
  legalBoost: 0.25,
  inProgressFactor: 0.5,
  minRaters: 3,
  maxDepth: 4,
  sizeMult: { small: 0.7, medium: 1.0, large: 1.3 },
  maturityMod: [1.3, 1.15, 1.0, 0.85, 0.7],
  capacity: { small: 10, medium: 20, large: 32 },
  strengthWeight: { primary: 1, supporting: 0.5, toAssess: 0.5 },
  coverageGreen: 0.8,
  coverageAmber: 0.4,
};

export interface Scenario {
  id: string;
  name: string;
  description: string;
  orgSize: OrgSize;
  role: Role;
  risk: RiskClass;
  importance: Record<string, number>;
  current: number;
  target: number;
  currentOverrides?: Record<string, number>;
  targetOverrides?: Record<string, number>;
}

const flat = (v: number, o: Record<string, number> = {}): Record<string, number> => {
  const r: Record<string, number> = {};
  for (let i = 1; i <= 13; i++) r[`EG${String(i).padStart(2, "0")}`] = v;
  return { ...r, ...o };
};

// Illustrative values to show how the framework reacts. They are not empirical and must be justified in the thesis.
export const SCENARIOS: Scenario[] = [
  { id: "balanced", name: "Balanced", description: "All enterprise goals equally important, medium-sized organisation. A neutral starting point.",
    orgSize: "medium", role: "both", risk: "unknown", importance: flat(3), current: 2, target: 3 },
  { id: "regulated", name: "Regulated deployer", description: "A medium-sized organisation in a regulated sector that deploys high-risk AI. Compliance and risk dominate.",
    orgSize: "medium", role: "deployer", risk: "high",
    importance: flat(2, { EG02: 5, EG03: 5, EG11: 4, EG06: 4, EG07: 3, EG05: 3, EG12: 3, EG13: 1 }),
    current: 2, target: 4, currentOverrides: { "Data governance": 1 } },
  { id: "innovation", name: "Innovation-led small organisation", description: "A small organisation using AI mainly to grow and innovate, with little governance in place yet.",
    orgSize: "small", role: "deployer", risk: "nothigh",
    importance: flat(2, { EG01: 5, EG13: 5, EG12: 4, EG08: 4, EG09: 3, EG10: 3, EG02: 3 }),
    current: 1, target: 3 },
  { id: "provider", name: "Large AI provider", description: "A large organisation that builds and sells high-risk AI systems, with an established governance base.",
    orgSize: "large", role: "provider", risk: "high",
    importance: flat(3, { EG03: 5, EG02: 5, EG05: 4, EG06: 4, EG07: 4, EG11: 4, EG04: 2, EG09: 2 }),
    current: 3, target: 4, currentOverrides: { "Strategy, value & investment": 2 } },
];

export function makeProfile(sc: Scenario, data: DataSet): Profile {
  const cur: Record<string, number> = {}, tgt: Record<string, number> = {};
  for (const d of data.domains) {
    cur[d] = sc.currentOverrides?.[d] ?? sc.current;
    tgt[d] = Math.max(cur[d], sc.targetOverrides?.[d] ?? sc.target);
  }
  return {
    scenarioId: sc.id, orgSize: sc.orgSize, role: sc.role, risk: sc.risk,
    importance: { ...sc.importance }, current: cur, target: tgt,
    includeTechnical: false, params: structuredClone(DEFAULT_PARAMS),
  };
}
