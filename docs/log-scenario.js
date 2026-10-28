// Approach B: no backend at all. This page just builds a GitHub "new
// issue" URL pre-filled from the form (field `id`s double as the issue
// form's pre-fill query parameter names; see
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
  } finally {
    updateSubmitSummary(); // which use-case box is shown may have changed
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
  return `[Usage scenario] ${useCaseId}: ${shortIntent}`;
}

// The "what went wrong" follow-up fields only apply when the outcome wasn't
// fully successful, so they're shown only then. All of them are optional.
function syncFollowups() {
  followups.hidden = outcomeSelect.value === "" || outcomeSelect.value === "Y";
}

outcomeSelect.addEventListener("change", syncFollowups);
syncFollowups(); // in case the browser restores a selected value on reload

// Validation is shown on the page, never in the browser's own bubble
// (the form is `novalidate`): a message under each field that needs
// fixing, and a line beside the submit button listing what's still left.
// A wrong format shows as soon as the user leaves a filled-in field;
// "please fill this in" waits until the first submit attempt, so a fresh
// form isn't covered in red.
const submitSummary = document.getElementById("submit-summary");
let triedSubmit = false;

// Fields the user fills in, minus the Use case ID dropdown while the typed
// "new ID" box stands in for it (so Use case ID counts once).
function checkedFields() {
  return Array.from(form.querySelectorAll("input, select, textarea")).filter(
    (field) =>
      (field.required || field.pattern || field.type === "url") &&
      !field.closest("[hidden]") &&
      !field.hidden &&
      !(field === useCaseIdSelect && !useCaseIdNew.hidden)
  );
}

// Both Use case ID controls share one message slot.
function errorSlotFor(field) {
  const key = field === useCaseIdSelect || field === useCaseIdNew ? "use_case_id" : field.id;
  return document.getElementById(`${key}-error`);
}

function fieldLabel(field) {
  const key = field === useCaseIdNew ? "use_case_id_select" : field.id;
  // Drop a trailing format note, e.g. "Query run date (DD/MM/YYYY)".
  return form
    .querySelector(`label[for="${key}"]`)
    .textContent.trim()
    .replace(/\s*\([^)]*\)$/, "");
}

function fieldError(field) {
  const v = field.validity;
  if (v.valueMissing) {
    return field.tagName === "SELECT" ? "Please choose one." : "Please fill this in.";
  }
  if (v.patternMismatch || v.typeMismatch) return field.dataset.error || field.title;
  return "";
}

function showFieldError(field, force) {
  const slot = errorSlotFor(field);
  if (!slot) return;
  const message = fieldError(field);
  const shown = message && (force || triedSubmit || !field.validity.valueMissing);
  slot.textContent = shown ? message : "";
  slot.hidden = !shown;
  if (shown) field.setAttribute("aria-invalid", "true");
  else field.removeAttribute("aria-invalid");
}

function clearFieldErrors() {
  form.querySelectorAll(".field-error").forEach((slot) => {
    slot.textContent = "";
    slot.hidden = true;
  });
  form.querySelectorAll("[aria-invalid]").forEach((field) => field.removeAttribute("aria-invalid"));
}

function focusField(field) {
  field.scrollIntoView({ behavior: "smooth", block: "center" });
  field.focus({ preventScroll: true });
}

// Past this many, the line just gives the count (a fresh form would
// otherwise list every required field).
const MAX_LISTED = 4;

function updateSubmitSummary() {
  const left = checkedFields().filter((field) => !field.checkValidity());
  submitSummary.replaceChildren();
  submitSummary.classList.toggle("is-done", left.length === 0);
  if (left.length === 0) {
    submitSummary.textContent = "All required fields are done.";
    return;
  }
  const required = left.filter((field) => field.required).length;
  const intro =
    required === left.length
      ? `${left.length} required field${left.length === 1 ? "" : "s"} left`
      : `${left.length} field${left.length === 1 ? "" : "s"} to fix`;
  if (left.length > MAX_LISTED) {
    submitSummary.textContent = `${intro}.`;
    return;
  }
  submitSummary.append(`${intro}: `);
  left.forEach((field, i) => {
    if (i > 0) submitSummary.append(" · ");
    const link = document.createElement("a");
    link.href = `#${field.id}`;
    link.textContent = fieldLabel(field);
    link.addEventListener("click", (evt) => {
      evt.preventDefault();
      focusField(field);
    });
    submitSummary.append(link);
  });
}

// Leaving a field: show its format problem, if any.
form.addEventListener("focusout", (evt) => {
  if (evt.target.matches("input, select, textarea")) showFieldError(evt.target);
});
form.addEventListener("change", (evt) => showFieldError(evt.target));
// While typing: only update a message that's already showing, so it clears
// the moment the value is fixed.
form.addEventListener("input", (evt) => {
  if (evt.target.getAttribute("aria-invalid") === "true") showFieldError(evt.target);
});
form.addEventListener("input", updateSubmitSummary);
form.addEventListener("change", updateSubmitSummary);
updateSubmitSummary();

function showError(text) {
  messageEl.className = "form-message form-message-error";
  messageEl.textContent = text;
  messageEl.hidden = false;
}

form.addEventListener("submit", (evt) => {
  evt.preventDefault();

  const invalid = checkedFields().filter((field) => !field.checkValidity());
  if (invalid.length > 0) {
    triedSubmit = true;
    checkedFields().forEach((field) => showFieldError(field, true));
    updateSubmitSummary();
    focusField(invalid[0]);
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
    triedSubmit = false;
    clearFieldErrors();
    updateSubmitSummary();
    messageEl.className = "form-message form-message-success";
    messageEl.textContent =
      "Opened GitHub in a new tab. Review and submit the issue there.";
    messageEl.hidden = false;
  } else {
    showError("Your browser blocked the new tab. Allow pop-ups for this site and try again.");
  }
});
