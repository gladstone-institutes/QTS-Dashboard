"""
Reads the tracking data (local sample CSV for now — see config.DATA_SOURCE)
and writes ONLY aggregate numbers to docs/data/stats.json — the single
public artifact this pipeline produces.

Privacy boundary: this file is the one place that touches row-level data.
Never extend it to dump raw rows (query text, submitter identity, etc.)
into OUTPUT_PATH — only computed counts/summaries belong there, since that
file ends up in a public repo. This matters just as much once DATA_SOURCE
switches to a real, private Google Sheet.

DATA_SOURCE == "google_sheets" isn't wired up to real credentials yet (see
README's "Connecting the real sheet later" section) — the auth code below
is kept ready to go, following the team's success-metrics repo's ADC
pattern, imported lazily so local-mode runs need no Google libraries at all.
"""

import json
import os
import sys
from datetime import datetime, timezone

import pandas as pd

import config


def fetch_rows_local() -> pd.DataFrame:
    """Read the local stand-in dataset (see pipeline/sample_data/)."""
    return pd.read_csv(config.LOCAL_DATA_PATH)


def fetch_rows_google_sheets() -> pd.DataFrame:
    """
    Read the real Google Sheet. Not yet usable in this org (Sheets API
    access requires a GCP project for quota, which is currently blocked) —
    kept here, ready to swap in once that's resolved.

    Auth via Application Default Credentials (ADC), matching the team's
    success-metrics repo's init.py: `gcloud auth application-default login`
    locally, or GOOGLE_APPLICATION_CREDENTIALS pointed at a service-account
    key file in CI — same call either way, no branching code needed.
    """
    import google.auth
    import gspread

    try:
        credentials, _project = google.auth.default(scopes=config.SCOPES)
        client = gspread.authorize(credentials)
    except Exception as e:
        raise RuntimeError(
            "Failed to authenticate with Google Cloud ADC. Locally, run "
            "'gcloud auth application-default login'. In CI, make sure "
            "GOOGLE_APPLICATION_CREDENTIALS points at a valid service-account "
            f"key file. Original error: {e}"
        ) from e

    sheet = client.open_by_key(config.SHEET_ID)
    worksheet = sheet.worksheet(config.WORKSHEET_NAME)
    return pd.DataFrame(worksheet.get_all_records())


def fetch_rows() -> pd.DataFrame:
    if config.DATA_SOURCE == "google_sheets":
        return fetch_rows_google_sheets()
    return fetch_rows_local()


def build_stats(df: pd.DataFrame) -> dict:
    """Compute the aggregate-only summary that's safe to publish."""
    if config.GAP_COLUMN not in df.columns:
        raise KeyError(
            f"Column '{config.GAP_COLUMN}' not found in the data. "
            f"Available columns: {list(df.columns)}"
        )

    gap_series = df[config.GAP_COLUMN].astype(str).str.strip()
    gap_series = gap_series.replace("", config.MISSING_LABEL)
    gap_series = gap_series.where(gap_series != "nan", config.MISSING_LABEL)

    gap_counts = gap_series.value_counts().sort_values(ascending=False)

    monthly_counts = {}
    if config.TIMESTAMP_COLUMN in df.columns:
        timestamps = pd.to_datetime(df[config.TIMESTAMP_COLUMN], errors="coerce")
        months = timestamps.dropna().dt.to_period("M").astype(str)
        # "YYYY-MM" strings sort chronologically as plain strings, so this
        # stays ordered without needing to keep the Period type around.
        monthly_counts = {
            k: int(v) for k, v in months.value_counts().sort_index().items()
        }

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_rows": int(len(df)),
        "gap_counts": {str(k): int(v) for k, v in gap_counts.items()},
        "monthly_counts": monthly_counts,
    }


def main():
    df = fetch_rows()
    stats = build_stats(df)

    output_path = os.path.abspath(config.OUTPUT_PATH)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(stats, f, indent=2)

    print(f"Wrote {output_path}")
    print(f"  data_source: {config.DATA_SOURCE}")
    print(f"  total_rows: {stats['total_rows']}")
    print(f"  gap_counts: {stats['gap_counts']}")
    print(f"  monthly_counts: {stats['monthly_counts']}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
