# AI governance roadmap (prototype)

A static, client-side website that turns a set of AI governance actions into a prioritised roadmap. Change the organisation's context (goal weights, size, role, risk class, maturity) and the roadmap, quadrant chart and coverage report update immediately. No backend.

## Run locally
    npm run build          # compiles src/*.ts to docs/js and copies data (needs only the typescript compiler: `tsc`)
    node scripts/serve.mjs 8099   # open http://localhost:8099
    npm test               # engine tests (node --test)

## Publish on GitHub Pages
1. Push this folder to a GitHub repository.
2. Settings > Pages > Deploy from branch > `main`, folder `/docs`.
3. The site is then live at `https://<user>.github.io/<repo>/`. Pages sites are public, so do not put confidential data in `src/data`.

## Data
All data lives in `src/data/*.json` (copied to `docs/data` by the build).
- `npm run data` re-generates it from the workbook (`python3 scripts/build_data.py <workbook.xlsx>`). Current data = the 92 actions of the thesis workbook: not expert-validated, English texts are drafts, effort values are placeholders, EU AI Act role/risk applicability is a first draft.
- `src/data/review.json` lists references that could not be resolved safely (shown on the Method page).

## Loading expert data later
Fill `src/data/expert.json`:

    { "actions": { "G01": { "effortMedian": 3, "raters": 5, "iqr": 1 } },
      "links": {}, "dependencies": {} }

An action's expert effort replaces the placeholder once it has at least `minRaters` raters (default 3, adjustable on the Method page). Rebuild, commit, done.

## Model
See the "Method and data" page in the site, and `src/engine.ts` (pure functions, covered by `tests/engine.test.mjs`).
