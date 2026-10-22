"""
Local-dev server: serves docs/ (the same thing `python -m http.server
--directory docs` did) and additionally handles POST /api/submit, which
appends a new row to pipeline/sample_data/tracking_sheet.csv and re-runs
the aggregation pipeline in-process so docs/data/stats.json reflects it
immediately.

Local-dev only: the deployed public GitHub Pages site has no backend, so
/api/submit only works against this server, not the live site. Same
underlying constraint as README's "Connecting the real sheet later"
section on the read side.

Privacy note: this only ever appends the four submitted fields plus a
generated id/timestamp to the local CSV — the same column set
fetch_and_aggregate.py already treats as fine to have locally. See that
file's docstring for the boundary that matters once a real (private) sheet
is connected.
"""

import csv
import json
import os
import re
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import config
import fetch_and_aggregate

DOCS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "docs"))

CSV_FIELDS = [
    "Timestamp",
    "Query ID",
    "Submitted by role",
    "Input query details",
    "Expected outcome",
    "Nature of the gap they want to close",
]

REQUIRED_FIELDS = [
    "gap_nature",
    "input_query_details",
    "expected_outcome",
    "submitted_by_role",
]


def _next_query_id(csv_path: str) -> str:
    max_n = 999
    if os.path.exists(csv_path):
        with open(csv_path, newline="") as f:
            for row in csv.DictReader(f):
                m = re.match(r"Q-(\d+)$", (row.get("Query ID") or "").strip())
                if m:
                    max_n = max(max_n, int(m.group(1)))
    return f"Q-{max_n + 1}"


def append_submission(data: dict) -> None:
    """Append one validated submission as a new row in the local CSV."""
    csv_path = config.LOCAL_DATA_PATH
    row = {
        "Timestamp": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "Query ID": _next_query_id(csv_path),
        "Submitted by role": data["submitted_by_role"],
        "Input query details": data["input_query_details"],
        "Expected outcome": data["expected_outcome"],
        "Nature of the gap they want to close": data["gap_nature"],
    }
    file_exists = os.path.exists(csv_path)
    os.makedirs(os.path.dirname(csv_path), exist_ok=True)
    with open(csv_path, "a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        if not file_exists:
            writer.writeheader()
        writer.writerow(row)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DOCS_DIR, **kwargs)

    def do_POST(self):
        if self.path != "/api/submit":
            self.send_error(404, "Not found")
            return

        length = int(self.headers.get("Content-Length", 0) or 0)
        body = self.rfile.read(length) if length else b""
        try:
            data = json.loads(body or b"{}")
        except json.JSONDecodeError:
            self._send_json(400, {"ok": False, "error": "Invalid JSON body."})
            return

        missing = [f for f in REQUIRED_FIELDS if not str(data.get(f, "")).strip()]
        if missing:
            self._send_json(
                400,
                {
                    "ok": False,
                    "error": f"Missing required field(s): {', '.join(missing)}",
                },
            )
            return

        try:
            append_submission(data)
            fetch_and_aggregate.main()
        except Exception as e:
            self._send_json(500, {"ok": False, "error": str(e)})
            return

        self._send_json(200, {"ok": True})

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    port = int(os.environ.get("PORT", 8000))
    server = ThreadingHTTPServer(("localhost", port), Handler)
    print(f"Serving {DOCS_DIR}")
    print(f"  http://localhost:{port}  (POST /api/submit appends to {config.LOCAL_DATA_PATH})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
