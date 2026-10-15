import { DEFAULT_PARAMS, SCENARIOS, makeProfile } from "./defaults.js";
import { compute } from "./engine.js";
import type { DataSet, Profile, Result, Status } from "./types.js";

const KEY = "aigov.v1";

export interface State {
  profile: Profile;
  status: Record<string, Status>;
  selected: string | null;      // action id shown in the drawer
  result: Result;
  previous: Result | null;      // result before the latest change, to show movement
}

let data: DataSet;
let state: State;
const listeners = new Set<() => void>();

export function getData() { return data; }
export function getState() { return state; }
export function subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); }

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify({ profile: state.profile, status: state.status })); } catch { /* storage may be unavailable */ }
}

function recompute(keepPrevious = true) {
  const prev = keepPrevious ? state.result : null;
  state.previous = prev;
  state.result = compute(data, state.profile, state.status);
}

function mergeProfile(saved: Partial<Profile> | undefined, base: Profile): Profile {
  if (!saved) return base;
  const p = { ...base, ...saved };
  p.params = { ...DEFAULT_PARAMS, ...(saved.params ?? {}),
    sizeMult: { ...DEFAULT_PARAMS.sizeMult, ...(saved.params?.sizeMult ?? {}) },
    capacity: { ...DEFAULT_PARAMS.capacity, ...(saved.params?.capacity ?? {}) },
    strengthWeight: { ...DEFAULT_PARAMS.strengthWeight, ...(saved.params?.strengthWeight ?? {}) } };
  p.importance = { ...base.importance, ...(saved.importance ?? {}) };
  p.current = { ...base.current, ...(saved.current ?? {}) };
  p.target = { ...base.target, ...(saved.target ?? {}) };
  return p;
}

function fromHash(): { profile?: Partial<Profile>; status?: Record<string, Status> } | null {
  const m = location.hash.match(/[?&]s=([^&]+)/);
  if (!m) return null;
  try { return JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1]))))); } catch { return null; }
}

export function init(d: DataSet) {
  data = d;
  const base = makeProfile(SCENARIOS[0], d);
  let saved: { profile?: Partial<Profile>; status?: Record<string, Status> } | null = fromHash();
  if (!saved) {
    try { const raw = localStorage.getItem(KEY); if (raw) saved = JSON.parse(raw); } catch { saved = null; }
  }
  const profile = mergeProfile(saved?.profile, base);
  state = { profile, status: saved?.status ?? {}, selected: null, result: compute(d, profile, saved?.status ?? {}), previous: null };
}

function emit() { for (const l of listeners) l(); }

export function update(mut: (p: Profile) => void) {
  mut(state.profile);
  recompute();
  persist();
  emit();
}

export function setScenario(id: string) {
  const sc = SCENARIOS.find((s) => s.id === id);
  if (!sc) return;
  const keepParams = state.profile.params;
  state.profile = makeProfile(sc, data);
  state.profile.params = keepParams;
  recompute(); persist(); emit();
}

export function resetParams() {
  state.profile.params = structuredClone(DEFAULT_PARAMS);
  recompute(); persist(); emit();
}

export function setStatus(id: string, s: Status) {
  if (s === "notStarted") delete state.status[id]; else state.status[id] = s;
  recompute(); persist(); emit();
}

export function resetStatus() { state.status = {}; recompute(); persist(); emit(); }

export function select(id: string | null) { state.selected = id; emit(); }

export function shareLink(): string {
  const payload = { profile: state.profile, status: state.status };
  const enc = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const base = location.href.split("#")[0];
  return `${base}#/roadmap?s=${encodeURIComponent(enc)}`;
}
