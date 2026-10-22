const form = document.getElementById("submit-form");
const messageEl = document.getElementById("form-message");
const submitBtn = form.querySelector(".form-submit");
const confirmCheckbox = document.getElementById("confirm-no-pii");
const ueicCheckbox = document.getElementById("confirm-ueic-member");

function syncSubmitButton() {
  submitBtn.disabled = !(confirmCheckbox.checked && ueicCheckbox.checked);
}

confirmCheckbox.addEventListener("change", syncSubmitButton);
ueicCheckbox.addEventListener("change", syncSubmitButton);
syncSubmitButton(); // in case the browser restores a checked state on reload

function showError(text) {
  messageEl.className = "form-message form-message-error";
  messageEl.textContent = text; // plain text only, no links needed for errors
  messageEl.hidden = false;
}

function showSuccess() {
  messageEl.className = "form-message form-message-success";
  messageEl.replaceChildren();
  messageEl.appendChild(document.createTextNode("Saved. "));
  const link = document.createElement("a");
  link.href = "index.html";
  link.textContent = "View dashboard →";
  messageEl.appendChild(link);
  messageEl.hidden = false;
}

form.addEventListener("submit", async (evt) => {
  evt.preventDefault();

  if (!form.reportValidity()) {
    return;
  }

  const payload = Object.fromEntries(new FormData(form).entries());
  submitBtn.disabled = true;
  messageEl.hidden = true;

  try {
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await res.json();

    if (res.ok && result.ok) {
      form.reset();
      showSuccess();
    } else {
      showError(result.error || "Something went wrong — please try again.");
    }
  } catch (err) {
    showError(
      "Couldn't reach the local server. Is `python pipeline/local_server.py` running?"
    );
  } finally {
    // form.reset() (on success) also unchecks the confirmation checkbox, so
    // re-derive the button state from it rather than unconditionally
    // re-enabling — it should require re-confirming for the next submission.
    syncSubmitButton();
  }
});
