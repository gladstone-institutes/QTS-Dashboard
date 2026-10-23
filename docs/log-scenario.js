// Approach B: no backend at all. This page just builds a GitHub "new
// issue" URL pre-filled from the form (field `id`s double as the issue
// form's pre-fill query parameter names — see
// https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-githubs-form-schema)
// and sends the browser there; the user's own GitHub session (and QTS-Data
// repo access) does the actual submitting.

const REPO_ISSUE_URL = "https://github.com/gladstone-institutes/QTS-Data/issues/new";
const TEMPLATE_NAME = "usage-scenario.yml";

const form = document.getElementById("scenario-form");
const messageEl = document.getElementById("form-message");
const outcomeSelect = document.getElementById("outcome");
const followups = document.getElementById("outcome-followups");
const useCaseIdSelect = document.getElementById("use_case_id_select");
const useCaseIdNew = document.getElementById("use_case_id_new");
const intentInput = document.getElementById("intent");

const NEW_USE_CASE_ID = "__new__";

// Use case ID is a dropdown of IDs already logged (published as
// stats.json's `use_case_ids` by QTS-Data's Action) plus an "add new"
// option that reveals a free-text box. If that list can't be loaded, the
// dropdown is dropped and the free-text box becomes the field.
function syncUseCaseId() {
  const typingNew = useCaseIdSelect.hidden || useCaseIdSelect.value === NEW_USE_CASE_ID;
  useCaseIdNew.hidden = !typingNew;
  useCaseIdNew.required = typingNew;
}

function useTextOnlyUseCaseId() {
  useCaseIdSelect.hidden = true;
  useCaseIdSelect.required = false;
  syncUseCaseId();
}

async function loadUseCaseIds() {
  try {
    const res = await fetch("./data/stats.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ids = (await res.json()).use_case_ids || [];
    if (ids.length === 0) {
      useTextOnlyUseCaseId();
      return;
    }
    const addNewOption = useCaseIdSelect.querySelector(`option[value="${NEW_USE_CASE_ID}"]`);
    ids.forEach((id) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = id;
      useCaseIdSelect.insertBefore(opt, addNewOption);
    });
  } catch (err) {
    useTextOnlyUseCaseId();
  }
}

function currentUseCaseId() {
  return useCaseIdNew.hidden ? useCaseIdSelect.value : useCaseIdNew.value.trim();
}

useCaseIdSelect.addEventListener("change", () => {
  syncUseCaseId();
  if (!useCaseIdNew.hidden) useCaseIdNew.focus();
});
syncUseCaseId();
loadUseCaseIds();

// GitHub issue titles aren't one of the 25 parsed fields (process_submission.py
// only reads the issue BODY) -- they just make QTS-Data's Issues list
// scannable. Built from fields that are always required, so both are
// guaranteed to have a value by the time this runs.
function buildTitle() {
  const useCaseId = currentUseCaseId();
  const intent = intentInput.value.trim();
  const MAX_INTENT_LEN = 60;
  const shortIntent =
    intent.length > MAX_INTENT_LEN ? `${intent.slice(0, MAX_INTENT_LEN).trim()}…` : intent;
  return `[Usage scenario] ${useCaseId} — ${shortIntent}`;
}

// Only required when the outcome wasn't fully successful — GitHub's native
// issue form can't express this conditional requiredness, so it's
// enforced here instead (see QTS-Data/scripts/config.py's
// REQUIRED_IF_NOT_FULLY_SUCCESSFUL for the canonical list).
const FOLLOWUP_FIELD_IDS = [
  "nodes_of_non_interest",
  "explanation_of_need",
  "system_functioning_level",
  "workaround_existing",
  "github_issue_link",
];

function syncFollowups() {
  const needsFollowup = outcomeSelect.value !== "" && outcomeSelect.value !== "Y";
  followups.hidden = !needsFollowup;
  FOLLOWUP_FIELD_IDS.forEach((id) => {
    document.getElementById(id).required = needsFollowup;
  });
}

outcomeSelect.addEventListener("change", syncFollowups);
syncFollowups(); // in case the browser restores a selected value on reload

function showError(text) {
  messageEl.className = "form-message form-message-error";
  messageEl.textContent = text;
  messageEl.hidden = false;
}

form.addEventListener("submit", (evt) => {
  evt.preventDefault();

  if (!form.reportValidity()) {
    return;
  }

  messageEl.hidden = true;

  const params = new URLSearchParams();
  params.set("template", TEMPLATE_NAME);
  params.set("title", buildTitle());
  params.set("use_case_id", currentUseCaseId());

  form.querySelectorAll("input[name], select[name], textarea[name]").forEach((field) => {
    const value = field.value.trim();
    if (value) {
      params.set(field.name, value);
    }
  });

  try {
    window.location.href = `${REPO_ISSUE_URL}?${params.toString()}`;
  } catch (err) {
    showError("Couldn't open GitHub — please try again.");
  }
});
