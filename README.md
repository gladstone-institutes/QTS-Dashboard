# QTS Dashboard

A public GitHub Pages dashboard reporting on NCATS Translator usage
scenarios logged by UEIC members — tracking the gap between what users
intended and what Translator delivered.

## Two-repo architecture

This repo (`QTS-Dashboard`) is **public** and holds **only the dashboard
and aggregate numbers** — no raw submission data, and no pipeline code,
ever live here.

The real tracking data (the full 26-column schema, including some
genuinely sensitive fields) and all the pipeline code live in a separate,
**private** repo, `gladstone-institutes/QTS-Data`. See that repo's own
README for how it's set up and how a submission flows through — in
short: someone fills in `docs/log-scenario.html` here, it redirects them
to a pre-filled GitHub issue on `QTS-Data` (no backend involved), a
GitHub Action there parses it, appends a row to the private CSV, and
pushes **only** the resulting `stats.json` back into this repo. Raw rows
never cross the boundary.

**This repo is static only.** It has no write-back and no local-preview
pipeline of its own — designing or testing a chart means working against
`QTS-Data/sample_data/tracking_data.csv` there (via
`QTS-Data/scripts/process_submission.py`'s `build_stats()`) and copying
the resulting `stats.json` here to preview, rather than maintaining a
second, duplicate copy of the schema/generator in this repo.

## Running it locally

```bash
python3 -m http.server 8000 --directory docs
# open http://localhost:8000
```

`docs/data/stats.json` is whatever was last pushed from `QTS-Data` (or
copied in manually for a preview) — this repo has nothing that generates
it.

## Publishing to GitHub Pages

Already live at `https://gladstone-institutes.github.io/QTS-Dashboard/`.
To redeploy after a change: commit, push to `main`, and Pages rebuilds
automatically from `/docs` (Settings → Pages → Deploy from a branch →
`main` / `/docs`).

## Repo layout

```
docs/                               # the GitHub Pages site -- the entirety of this repo
  index.html / style.css / app.js  # dashboard — stat tiles + 8 charts in a 2-column grid: gap nature,
                                    #   outcome, monthly trend, outcome-by-gap (stacked), where run,
                                    #   query pattern, keyword, cost of an incorrect answer
  log-scenario.html / log-scenario.js  # "Log a usage scenario" — builds a pre-filled GitHub issue
                                        # on QTS-Data and redirects there; no backend
  data/stats.json                  # the only data-derived file here — pushed in by QTS-Data's Action
```

## Privacy model

Only aggregate numbers (`total_rows`, `gap_counts`, `monthly_counts`,
`outcome_counts`, `where_run_counts`, `query_pattern_counts`,
`keyword_counts`, `cost_of_error_counts`, `outcome_by_gap`) are ever
written to `docs/data/stats.json`, plus one deliberate exception: the list
of distinct use case IDs (`use_case_ids`), which the log-scenario form
offers as a dropdown. No query text, facilitator names, or any other
row-level field is ever computed or stored here — see `QTS-Data`'s README and `scripts/process_submission.py`
for where that boundary is enforced.
