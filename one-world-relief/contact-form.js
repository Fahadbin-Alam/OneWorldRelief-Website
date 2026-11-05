// One World Relief contact form: sends the message through the /charity/contact Function.
// If the Function is unavailable it falls back to opening the visitor's email app.
(function () {
  const form = document.getElementById("contactForm");
  if (!form || !form.dataset.contactEndpoint) {
    return;
  }

  const CONTACT_EMAIL = "Oneworldrelief.fma@gmail.com";
  const nameField = document.getElementById("nameField");
  const emailField = document.getElementById("emailField");
  const messageField = document.getElementById("messageField");
  const honeypot = form.querySelector('input[name="website"]');
  const submit = document.getElementById("contactSubmit");
  const submitLabel = submit?.querySelector("[data-contact-submit-label]");
  const status = document.getElementById("contactFormStatus");
  const fields = [nameField, emailField, messageField].filter(Boolean);
  const errorElements = {
    nameField: document.getElementById("nameFieldError"),
    emailField: document.getElementById("emailFieldError"),
    messageField: document.getElementById("messageFieldError"),
  };

  const setStatus = (message = "", state = "") => {
    if (!status) {
      return;
    }
    status.replaceChildren(document.createTextNode(message));
    status.classList.toggle("success", state === "success");
    status.classList.toggle("error", state === "error");
  };

  const fieldError = (field) => {
    const value = field.value.trim();
    if (!value) {
      if (field === nameField) return "Please enter your full name.";
      if (field === emailField) return "Please enter your email address.";
      return "Please tell us how we can help.";
    }
    if (field === emailField && field.validity.typeMismatch) {
      return "Enter a valid email address, such as you@example.com.";
    }
    return "";
  };

  const validate = (field) => {
    const error = fieldError(field);
    field.toggleAttribute("aria-invalid", Boolean(error));
    if (errorElements[field.id]) {
      errorElements[field.id].textContent = error;
    }
    return !error;
  };

  const mailtoUrl = () => {
    const subject = encodeURIComponent("One World Relief question");
    const body = encodeURIComponent(`Name: ${nameField.value.trim()}\nEmail: ${emailField.value.trim()}\n\n${messageField.value.trim()}`);
    return `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  };

  const setBusy = (busy) => {
    form.toggleAttribute("aria-busy", busy);
    if (submit) submit.disabled = busy;
    if (submitLabel) submitLabel.textContent = busy ? "Sending…" : "Send Message";
  };

  const showFallback = (reason) => {
    setStatus(`${reason} `, "error");
    const link = document.createElement("a");
    link.href = mailtoUrl();
    link.textContent = "Send it from your email app instead";
    status?.appendChild(link);
    status?.appendChild(document.createTextNode("."));
  };

  fields.forEach((field) => {
    field.addEventListener("input", () => {
      if (field.hasAttribute("aria-invalid")) validate(field);
      setStatus();
    });
    field.addEventListener("blur", () => {
      if (field.value.trim() || field.hasAttribute("aria-invalid")) validate(field);
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (form.hasAttribute("aria-busy")) {
      return;
    }
    const invalid = fields.filter((field) => !validate(field));
    if (invalid.length) {
      setStatus("Please review the highlighted fields and try again.", "error");
      invalid[0].focus();
      return;
    }

    setBusy(true);
    setStatus();
    try {
      const response = await fetch(form.dataset.contactEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nameField.value.trim(),
          email: emailField.value.trim(),
          message: messageField.value.trim(),
          website: honeypot?.value || "",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        form.reset();
        setStatus("Thank you. Your message was sent, and we will reply by email.", "success");
        return;
      }
      if (payload.fallback === "mailto" || response.status >= 500) {
        showFallback(payload.detail || "Your message couldn't be sent right now.");
        return;
      }
      setStatus(payload.detail || "Please review your message and try again.", "error");
    } catch (_error) {
      showFallback("We couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  });
})();
