# Tool Usage Dashboard

A GitHub Pages dashboard reporting on tool-usage metrics — total row count
and a bar chart of the "Nature of the gap they want to close" column.

**Current status:** running against a **local synthetic dataset**
(`pipeline/sample_data/tracking_sheet.csv`), not the real Google Sheet.
Real Sheets access needs a Google Cloud project for API quota, which is
currently blocked by org policy — see **Connecting the real sheet later**
below. Everything else (pipeline, aggregation, frontend) is built the same
way it will run once that's resolved.

**Privacy model** (applies once the real sheet is connected): the Google
Sheet stays private. Only the aggregate numbers computed by
`pipeline/fetch_and_aggregate.py` (row count, per-category counts) are ever
written to `docs/data/stats.json`, which is what the public site reads — no
raw row data (query text, submitter identity, etc.) ever leaves the sheet.
See that file's docstring before changing what it outputs.

## Running it now (local data)

```bash
pip install -r pipeline/requirements.txt
python pipeline/fetch_and_aggregate.py     # writes docs/data/stats.json from the sample CSV
python pipeline/local_server.py            # serves docs/ AND handles the submit form's writes
# open http://localhost:8000
```

`pipeline/local_server.py` replaces a plain static-file server — it also
handles `POST /api/submit` (used by the **Submit a query** tab), appending
a row to `pipeline/sample_data/tracking_sheet.csv` and immediately re-running
the aggregation so the dashboard reflects it on next load. **This write-back
only works locally, against this server** — the deployed public GitHub Pages
site has no backend, same underlying constraint as the Sheets connection
below. If you only need to view the dashboard (no submissions), a plain
`python -m http.server 8000 --directory docs` still works fine too.

To regenerate the sample dataset (e.g. with a different distribution):

```bash
python pipeline/sample_data/generate_sample.py
```

`pipeline/config.py`'s `DATA_SOURCE` defaults to `"local"`. Nothing else
needs to change to try a different local file — just point
`LOCAL_DATA_PATH` at it (env var or edit the default).

## Publishing to GitHub Pages (works today, still on local data)

```bash
git init   # already done if you're reading this from the committed repo
git remote add origin https://github.com/<your-org>/<your-repo>.git
git push -u origin main
```

Then repo → **Settings → Pages** → **Source: Deploy from a branch** →
branch `main`, folder `/docs`. The dashboard will be live at
`https://<your-org>.github.io/<your-repo>/` shortly after — showing the
sample data, clearly labeled as such in the footer. Note: the deployed site's
**Submit a query** tab won't be able to actually save anything there — see
`/api/submit` above — until a real backend (GCP or Apps Script, per below)
is in place.

The included GitHub Action (`.github/workflows/refresh-dashboard.yml`) is
manual-trigger only for now (`workflow_dispatch`) since there's no live data
to poll on a schedule yet.

## Connecting the real sheet later

Two paths, neither wired up yet:

1. **Ask for access to an existing org GCP project** (if one already exists
   for this tool or a related grant) and create a service account inside
   it. Then set `DATA_SOURCE=google_sheets` in `pipeline/config.py`,
   `pip install gspread google-auth` (already in `requirements.txt`,
   commented out), and share the sheet with that service account's email.
   `pipeline/fetch_and_aggregate.py`'s `fetch_rows_google_sheets()` already
   implements this half (ADC auth, same pattern as the team's
   `success-metrics` repo) — it just needs real credentials to run against.
2. **Google Apps Script Web App** — no GCP project needed. A script bound
   directly to the sheet (Extensions → Apps Script, from inside the sheet)
   computes the same aggregates and serves them from a token-protected
   `doGet` endpoint; the pipeline would then do a plain HTTPS GET instead of
   using `gspread` at all. Worth checking whether your org's Workspace admin
   allows Apps Script Web App deployments (a separate setting from GCP
   project creation) before committing to this path.

Either way, only `fetch_rows()` in `pipeline/fetch_and_aggregate.py` needs
to change — the aggregation logic, privacy boundary, and frontend are
already source-agnostic.

## Repo layout

```
pipeline/fetch_and_aggregate.py    # reads data (local CSV or, later, the Sheet), writes docs/data/stats.json
pipeline/local_server.py           # local-dev only: serves docs/ + POST /api/submit (appends + re-aggregates)
pipeline/config.py                 # DATA_SOURCE, file paths, sheet id / column-name config
pipeline/sample_data/              # synthetic stand-in dataset + its generator
.github/workflows/refresh-dashboard.yml   # manual-trigger refresh (schedule disabled until live data exists)
docs/                               # the GitHub Pages site
  index.html / style.css / app.js  # dashboard — stat tiles + meter-style bar chart
  submit.html / submit.js          # "Submit a query" form (posts to /api/submit, local-dev only)
  data/stats.json                  # generated — the only public, sheet-derived file
```
