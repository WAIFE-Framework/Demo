export type OrgSize = "small" | "medium" | "large";
export type Role = "provider" | "deployer" | "both" | "unknown";
export type RiskClass = "high" | "nothigh" | "unknown";
export type Status = "notStarted" | "inProgress" | "done";
export type LinkStrength = "primary" | "supporting" | "toAssess";

export interface Action {
  id: string;
  domain: string;
  domainNl: string;
  title: string;
  titleNl: string;
  evidence: string;
  evidenceNl: string;
  level: "Strategic" | "Managerial" | "Technical";
  mechanism: string;
  owner: string;
  inScope: boolean;
  minOrgSize: OrgSize;
  baseEffort: number;
  effortSource: string;
  externalPrerequisitesNl: string[];
  euArticlesNl: string | null;
  otherIso: string[];
  mechanismsNl: Record<string, string | null> | null;
  source: string;
  validated: boolean;
  translationStatus: string;
}

export interface Goal { id: string; title: string; perspective: string; }

export interface Requirement {
  id: string;
  framework: string;
  code: string;
  title: string;
  level: string;
  parent: string | null;
  obligation: "binding" | "certifiable" | "guidance" | "voluntary";
  role: "any" | "provider" | "deployer";
  risk: "any" | "high";
  linkable: boolean;
  titleSource: string;
  workbookCoverage?: string;
  workbookRemaining?: string;
  workbookPriority?: string;
  indicative?: boolean;
}

export interface Link { actionId: string; requirementId: string; strength: LinkStrength; source: string; validated: boolean; }
export interface GoalLink { actionId: string; goalId: string; strength: number; source: string; validated: boolean; }
export interface Dependency { from: string; to: string; type: "hard" | "soft"; source: string; validated: boolean; }

export interface ExpertData {
  actions: Record<string, { effortMedian?: number; raters?: number; iqr?: number }>;
  links: Record<string, { agreement?: number; raters?: number }>;
  dependencies: Record<string, { agreement?: number; raters?: number }>;
}

export interface DataSet {
  meta: { version: string; generated: string; notes: string[]; counts: Record<string, number> };
  actions: Action[];
  goals: Goal[];
  domains: string[];
  requirements: Requirement[];
  links: Link[];
  goalLinks: GoalLink[];
  dependencies: Dependency[];
  review: { actionId: string | null; column: string; text: string; reason: string }[];
  expert: ExpertData;
}

export interface Params {
  beta: number;            // weight of the maturity gap
  lambda: number;          // weight of enabling value
  decay: number;           // enabling value decay per dependency step
  softEdgeWeight: number;  // contribution of soft prerequisites relative to hard ones
  legalBoost: number;      // maximum uplift for legally binding requirements
  inProgressFactor: number;
  minRaters: number;       // expert ratings needed before the expert effort replaces the placeholder
  maxDepth: number;        // dependency steps counted for enabling value
  sizeMult: Record<OrgSize, number>;
  maturityMod: number[];   // index 0 = maturity 1
  capacity: Record<OrgSize, number>; // effort points per roadmap horizon
  strengthWeight: Record<LinkStrength, number>;
  coverageGreen: number;
  coverageAmber: number;
}

export interface Profile {
  scenarioId: string;
  orgSize: OrgSize;
  role: Role;
  risk: RiskClass;
  importance: Record<string, number>;   // goal id -> 1..5
  current: Record<string, number>;      // domain -> maturity 1..5
  target: Record<string, number>;       // domain -> maturity 1..5
  includeTechnical: boolean;
  params: Params;
}

export interface Scored {
  action: Action;
  active: boolean;
  inactiveReason: string | null;
  impact: number;
  gap: number;
  legalFactor: number;
  need: number;
  enabling: number;
  enabledCount: number;
  value: number;
  effort: number;
  effortSource: "expert" | "placeholder";
  remainingEffort: number;
  priority: number;
  priorityIndex: number;
  rank: number | null;
  quadrant: "Quick win" | "Major project" | "Fill-in" | "Defer" | null;
  layer: number;
  effectivePriority: number;
  sequence: number | null;
  horizon: number | null;   // 1..4
  topGoals: string[];
  prerequisites: string[];  // active hard prerequisites
  enables: string[];        // direct dependents
  status: Status;
}

export interface CoverageRow {
  req: Requirement;
  applicable: boolean;
  actionIds: string[];
  primaryCount: number;
  coverage: number;
  projected: number[];      // coverage if everything up to horizon h were done (h = 1..4)
  gap: boolean;
  fragile: boolean;
  rag: "green" | "amber" | "red" | "none";
}

export interface Result {
  scored: Scored[];
  byId: Map<string, Scored>;
  goalWeights: Record<string, number>;
  medianValue: number;
  medianEffort: number;
  horizonEffort: number[];
  coverage: CoverageRow[];
  warnings: string[];
}
