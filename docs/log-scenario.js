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

// The "what went wrong" follow-up fields only apply when the outcome wasn't
// fully successful, so they're shown only then. All of them are optional.
function syncFollowups() {
  followups.hidden = outcomeSelect.value === "" || outcomeSelect.value === "Y";
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

  const issueTab = window.open(`${REPO_ISSUE_URL}?${params.toString()}`, "_blank");
  if (issueTab) {
    issueTab.opener = null; // the GitHub tab gets no handle back to this page
    // Clear the form so the same scenario isn't submitted twice by accident,
    // then re-sync the parts the JS shows/hides from the selected values.
    form.reset();
    syncFollowups();
    syncUseCaseId();
    messageEl.className = "form-message form-message-success";
    messageEl.textContent =
      "Opened GitHub in a new tab — review and submit the issue there.";
    messageEl.hidden = false;
  } else {
    showError("Your browser blocked the new tab — allow pop-ups for this site and try again.");
  }
});
