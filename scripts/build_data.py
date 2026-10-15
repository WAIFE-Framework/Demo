#!/usr/bin/env python3
"""Convert the thesis workbook into the JSON data files used by the site.

Usage: python3 scripts/build_data.py path/to/workbook.xlsx

The mappings in the workbook are semicolon-separated text inside single cells.
This script splits them into long-format links (action -> requirement, action -> goal,
action -> action) and writes everything to src/data/*.json.
Every record carries a `source` and `validated` flag so imported data, Claude-derived
data and expert-validated data can be told apart later.
Anything that cannot be resolved is written to review.json instead of being guessed.
"""
import json, re, sys, collections, datetime, pathlib
import openpyxl
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from translations_en import *

SRC = sys.argv[1] if len(sys.argv) > 1 else "workbook.xlsx"
OUT = pathlib.Path(__file__).resolve().parent.parent / "src" / "data"
OUT.mkdir(parents=True, exist_ok=True)

wb = openpyxl.load_workbook(SRC)
ws = wb["Actiechecklist"]
rows = [r for r in ws.iter_rows(min_row=4, values_only=True) if r[0]]
ids = [r[0] for r in rows]
idset = set(ids)
review = []

def split(s):
    return [t.strip() for t in re.split(r";", s or "") if t.strip()]

def owner_en(s):
    parts = [p.strip() for p in (s or "").split("/")]
    return " / ".join(OWNER_WORDS.get(p, p) for p in parts)

# ---------- implementation mechanisms (Dutch, not translated in the prototype)
mech = {}
for r in wb["Implementatiemechanismen"].iter_rows(min_row=6, values_only=True):
    if r[0] and r[0] in idset:
        mech[r[0]] = {"policy": r[3], "process": r[4], "technical": r[5], "structural": r[6], "relational": r[7]}

# ---------- dependencies
deps, external = [], {}
for r in rows:
    aid = r[0]
    ext = []
    for tok in split(r[5]):
        if re.fullmatch(r"[A-Z]\d{2}", tok):
            if tok in idset and tok != aid:
                deps.append({"from": tok, "to": aid, "type": "hard", "source": "imported", "validated": False})
            else:
                review.append({"actionId": aid, "column": "dependencies", "text": tok, "reason": "unknown or self-referencing action ID"})
        else:
            ext.append(tok)
    external[aid] = ext

# ---------- requirements + links
reqs = {}
links = []

def add_req(rid, framework, code, title, level, parent, obligation, title_source, role="any", risk="any", extra=None):
    if rid not in reqs:
        reqs[rid] = {"id": rid, "framework": framework, "code": code, "title": title, "level": level, "parent": parent,
                     "obligation": obligation, "role": role, "risk": risk, "titleSource": title_source,
                     "linkable": level in ("clause", "control", "category", "cluster")}
        if extra: reqs[rid].update(extra)

def add_link(aid, rid, src="imported"):
    if not any(l["actionId"] == aid and l["requirementId"] == rid for l in links):
        links.append({"actionId": aid, "requirementId": rid, "strength": "toAssess", "source": src, "validated": False})

# frameworks parents
FW = {"ISO 38507": "ISO/IEC 38507", "ISO 42001": "ISO/IEC 42001", "NIST AI RMF": "NIST AI RMF 1.0", "EU AI Act": "EU AI Act (Reg. 2024/1689)"}

# ISO 42001 clauses and controls: catalogue from the workbook's coverage sheet + clause numbers actually referenced
dekking_codes = [r[0] for r in wb["ISO 42001 dekking"].iter_rows(min_row=10, max_row=47, values_only=True) if r[0]]
missing_ctrl = set(dekking_codes) ^ set(ISO42001_CONTROLS)
if missing_ctrl:
    print("WARNING: control list differs from workbook:", missing_ctrl)
for code in dekking_codes:
    obj = ".".join(code.split(".")[:2])
    add_req(f"ISO42001-{code}", "ISO 42001", code, ISO42001_CONTROLS.get(code, code), "control", f"ISO42001-{obj}", "certifiable", "workbook+claude")
for obj, title in ISO42001_ANNEX_OBJ.items():
    add_req(f"ISO42001-{obj}", "ISO 42001", obj, title, "control objective", None, "certifiable", "claude")
for code, title in ISO42001_CLAUSES.items():
    if "." not in code:
        add_req(f"ISO42001-{code}", "ISO 42001", code, title, "chapter", None, "certifiable", "claude")
for code, title in ISO42001_CLAUSES.items():
    if "." in code:
        parent = code.split(".")[0] if code.count(".") == 1 else ".".join(code.split(".")[:2])
        add_req(f"ISO42001-{code}", "ISO 42001", code, title, "clause", f"ISO42001-{parent}", "certifiable", "claude")
# only keep the clause rows that are leaves (6.1 has children; 6.1 itself is structural)
for code in ("6.1",):
    reqs[f"ISO42001-{code}"]["linkable"] = False

for code, title in ISO38507_EN.items():
    add_req(f"ISO38507-{code}", "ISO 38507", code, title, "clause", None, "guidance", "workbook+claude", extra={"indicative": True})
for code, title in NIST_EN.items():
    fn = code.split()[0]
    add_req(f"NIST-{code.replace(' ', '-')}", "NIST AI RMF", code, title, "category", f"NIST-{fn}", "voluntary", "workbook+claude")
for fn in ("GOVERN", "MAP", "MEASURE", "MANAGE"):
    add_req(f"NIST-{fn}", "NIST AI RMF", fn, fn.capitalize(), "function", None, "voluntary", "claude")
    reqs[f"NIST-{fn}"]["linkable"] = False

# EU clusters from the gap table
ws_eu = wb["EU AI Act vergelijking"]
eu_rows = [r for r in ws_eu.iter_rows(min_row=1, values_only=True) if r[0] and re.fullmatch(r"EU\d{2}", str(r[0]))]

def expand(spec):
    out = []
    for part in re.split(r",\s*", spec or ""):
        part = part.strip()
        m = re.fullmatch(r"([A-Z])(\d{2})-([A-Z])?(\d{2})", part)
        if m:
            pre, a, _, b = m.groups()
            out += [f"{pre}{n:02d}" for n in range(int(a), int(b) + 1)]
        elif re.fullmatch(r"[A-Z]\d{2}", part):
            out.append(part)
        elif part:
            review.append({"actionId": None, "column": "EU linked actions", "text": part, "reason": "could not expand action range"})
    return out

for r in eu_rows:
    cid = r[0]
    title, role, risk = EU_EN[cid]
    add_req(f"EUAIA-{cid}", "EU AI Act", cid, title, "cluster", None, "binding", "workbook+claude", role=role, risk=risk,
            extra={"workbookCoverage": r[2], "workbookRemaining": r[4], "workbookPriority": r[5], "titleNl": r[1],
                   "applicabilitySource": "claude-draft"})
    for aid in expand(r[3]):
        if aid in idset:
            add_link(aid, f"EUAIA-{cid}")
        else:
            review.append({"actionId": aid, "column": "EU linked actions", "text": aid, "reason": "unknown action ID"})

# action columns
for r in rows:
    aid = r[0]
    for tok in split(r[9]):
        m = re.match(r"(\d\.\d)\b", tok)
        if m and f"ISO38507-{m.group(1)}" in reqs:
            add_link(aid, f"ISO38507-{m.group(1)}")
        elif tok.startswith("n.v.t."):
            continue
        else:
            review.append({"actionId": aid, "column": "ISO 38507", "text": tok, "reason": "no matching chapter"})
    for tok in split(r[11]):
        code = re.sub(r"\(.*\)$", "", tok)
        rid = f"ISO42001-{code}"
        if rid in reqs:
            add_link(aid, rid)
            if tok != code:
                review.append({"actionId": aid, "column": "ISO 42001", "text": tok, "reason": f"sub-item reference linked at {code}"})
        else:
            review.append({"actionId": aid, "column": "ISO 42001", "text": tok, "reason": "no matching clause/control (e.g. generic reference)"})
    for tok in split(r[12]):
        rid = "NIST-" + tok.replace(" ", "-")
        if rid in reqs:
            add_link(aid, rid)
        else:
            review.append({"actionId": aid, "column": "NIST AI RMF", "text": tok, "reason": "no matching category"})

# goal links
goal_links = []
for r in rows:
    for tok in split(r[13]):
        if tok in GOALS_EN:
            goal_links.append({"actionId": r[0], "goalId": tok, "strength": 1, "source": "imported", "validated": False})
        else:
            review.append({"actionId": r[0], "column": "COBIT", "text": tok, "reason": "unknown goal"})

# EU articles per action (kept as text; the cluster is the unit of coverage)
eu_art = {r[0]: r[14] for r in rows}
other_iso = {r[0]: [t for t in split(r[10])] for r in rows}
noeu = [a for a in ids if not any(l["actionId"] == a and l["requirementId"].startswith("EUAIA") for l in links)
        and eu_art.get(a) and re.search(r"Art\.", eu_art[a])]
for a in noeu:
    review.append({"actionId": a, "column": "EU AI Act", "text": eu_art[a][:90],
                   "reason": "action cites EU articles but is not listed under any EU cluster of the gap table (cluster link missing or article-level link only)"})

# ---------- actions
def effort_placeholder(aid, level, mechanism, owner, n_prereq):
    e = 2
    if mechanism == "Structure": e += 1
    if n_prereq >= 3: e += 1
    if "/" in owner: e += 1
    return min(5, e)

prereq_count = collections.Counter(d["to"] for d in deps)
actions = []
for r in rows:
    aid = r[0]
    level = LEVEL_EN[r[4]]
    mechn = MECH_EN[r[3]]
    title_en, ev_en = ACTIONS_EN[aid]
    own = owner_en(r[7])
    actions.append({
        "id": aid,
        "domain": DOMAIN_EN[r[1]], "domainNl": r[1],
        "title": title_en, "titleNl": r[2],
        "evidence": ev_en, "evidenceNl": r[6],
        "level": level, "mechanism": mechn,
        "owner": own,
        "inScope": level != "Technical",
        "minOrgSize": "small",
        "baseEffort": effort_placeholder(aid, level, mechn, own, prereq_count[aid]),
        "effortSource": "placeholder-heuristic",
        "externalPrerequisitesNl": external[aid],
        "euArticlesNl": eu_art.get(aid),
        "otherIso": other_iso.get(aid, []),
        "mechanismsNl": mech.get(aid),
        "source": "imported", "validated": False, "translationStatus": "claude-draft",
    })

goals = [{"id": k, "title": v[0], "perspective": v[1]} for k, v in GOALS_EN.items()]
domains = sorted({a["domain"] for a in actions})
meta = {
    "version": "0.1-prototype",
    "generated": datetime.date.today().isoformat(),
    "sourceWorkbook": pathlib.Path(SRC).name,
    "notes": [
        "Prototype data: the 92 actions, mappings and dependencies come from the thesis workbook as they stand; none are expert-validated.",
        "Effort values are a placeholder heuristic (structure, number of prerequisites, cross-functional owner), NOT expert ratings.",
        "Link strengths are all 'to assess'; EU role/risk applicability is a first draft to be verified by a legal expert.",
        "English texts are machine-translated drafts of the Dutch workbook text.",
    ],
    "counts": {"actions": len(actions), "requirements": len(reqs), "links": len(links), "goalLinks": len(goal_links),
               "dependencies": len(deps), "reviewItems": len(review)},
}

def dump(name, obj):
    (OUT / f"{name}.json").write_text(json.dumps(obj, ensure_ascii=False, indent=1))

dump("meta", meta); dump("actions", actions); dump("goals", goals); dump("domains", domains)
dump("requirements", list(reqs.values())); dump("links", links); dump("goalLinks", goal_links)
dump("dependencies", deps); dump("review", review)
dump("expert", {"_readme": "Expert ratings are merged here later (see scripts/aggregate_experts.py). Empty = placeholders are used.", "actions": {}, "links": {}, "dependencies": {}})

# ---------- report
print(json.dumps(meta["counts"], indent=1))
print("domains:", len(domains))
print("review items by reason:", collections.Counter(r["reason"] for r in review))
print("actions with EU article text but no EU cluster link:", noeu)
print("unlinked actions (no requirement link):", [a for a in ids if not any(l["actionId"] == a for l in links)])
print("links per framework:", collections.Counter(reqs[l["requirementId"]]["framework"] for l in links))
print("requirements by framework/linkable:", collections.Counter((q["framework"], q["linkable"]) for q in reqs.values()))
print("unlinked linkable requirements:", [q["id"] for q in reqs.values() if q["linkable"] and not any(l["requirementId"] == q["id"] for l in links)])
print("effort distribution:", collections.Counter(a["baseEffort"] for a in actions))
