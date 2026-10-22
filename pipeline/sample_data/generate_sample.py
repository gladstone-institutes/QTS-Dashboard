"""
Generates a synthetic local CSV that stands in for the real Google Sheet,
so the dashboard can be built and designed without needing Google auth
wired up yet. Re-run this any time to regenerate a fresh sample:

    python pipeline/sample_data/generate_sample.py

Once the real sheet is connected (see README), this file and its output
are no longer used — DATA_SOURCE just switches to "google_sheets".
"""

import csv
import os
import random
from datetime import datetime, timedelta

random.seed(7)

GAP_CATEGORIES = [
    "Data access / discovery",
    "Knowledge gap",
    "Tooling / workflow automation",
    "Data integration across sources",
    "Reproducibility",
    "Standardization / terminology",
    "",  # left blank on purpose -> should land in "Unspecified"
]
# Rough weights so the bar chart has real variety instead of a flat line.
WEIGHTS = [30, 20, 18, 12, 8, 7, 5]

EXPECTED_OUTCOMES = [
    "A ranked list of candidate entities",
    "A merged, deduplicated dataset",
    "A reusable pipeline others can rerun",
    "A citation-backed summary",
    "A single API instead of five",
    "Consistent identifiers across sources",
]

ROLES = ["Researcher", "Data engineer", "Analyst", "PI", "Postdoc", "RA"]

N_ROWS = 143
start = datetime(2026, 3, 1)

rows = []
for i in range(N_ROWS):
    ts = start + timedelta(days=random.randint(0, 180), hours=random.randint(0, 23))
    gap = random.choices(GAP_CATEGORIES, weights=WEIGHTS, k=1)[0]
    rows.append(
        {
            "Timestamp": ts.strftime("%Y-%m-%d %H:%M"),
            "Query ID": f"Q-{1000 + i}",
            "Submitted by role": random.choice(ROLES),
            "Input query details": f"Sample query #{i + 1} (placeholder text)",
            "Expected outcome": random.choice(EXPECTED_OUTCOMES),
            "Nature of the gap they want to close": gap,
        }
    )

out_path = os.path.join(os.path.dirname(__file__), "tracking_sheet.csv")
with open(out_path, "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)

print(f"Wrote {len(rows)} rows to {out_path}")
