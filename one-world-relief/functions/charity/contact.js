// One World Relief contact form: emails the message to the organization through Resend.
// Needs OWR_RESEND_API_KEY plus a verified sender (OWR_CONTACT_FROM_EMAIL, or the receipt sender).
// When email is not configured it answers 503 and the page falls back to the visitor's email app.
const DEFAULT_CONTACT_TO_EMAIL = "Oneworldrelief.fma@gmail.com";
const MAX_MESSAGE_LENGTH = 2000;

const json = (payload, status = 200) => {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
};

const isValidEmail = (value) => {
  return value.length <= 254 && /^[^\s@|<>]{1,64}@[^\s@|<>]{1,189}\.[^\s@|<>]{2,}$/u.test(value);
};

// Keep header-bound values on one line so nothing can be smuggled into the email headers.
const singleLine = (value, maxLength) => String(value || "").replace(/[\r\n\t]+/g, " ").trim().slice(0, maxLength);

export const onRequestPost = async ({ request, env }) => {
  let body;
  try {
    body = await request.json();
  } catch (_error) {
    return json({ detail: "Invalid request." }, 400);
  }

  // Hidden honeypot field: people never see it, simple bots fill it in. Pretend it worked.
  if (String(body.website || "").trim()) {
    return json({ status: "sent" });
  }

  const name = singleLine(body.name, 100);
  const email = singleLine(body.email, 254);
  const message = String(body.message || "").replace(/\r\n/g, "\n").trim();

  if (name.length < 2) {
    return json({ detail: "Please enter your full name." }, 400);
  }
  if (!isValidEmail(email)) {
    return json({ detail: "Enter a valid email address, such as you@example.com." }, 400);
  }
  if (!message) {
    return json({ detail: "Please tell us how we can help." }, 400);
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return json({ detail: `Please keep your message under ${MAX_MESSAGE_LENGTH} characters.` }, 400);
  }

  const fromEmail = env.OWR_CONTACT_FROM_EMAIL || env.OWR_RECEIPT_FROM_EMAIL;
  if (!env.OWR_RESEND_API_KEY || !fromEmail) {
    console.error("One World Relief contact email is not configured.");
    return json({ detail: "Messages can't be sent from this page right now.", fallback: "mailto" }, 503);
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OWR_RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [env.OWR_CONTACT_TO_EMAIL || DEFAULT_CONTACT_TO_EMAIL],
      reply_to: email,
      subject: `Website message from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\n\n${message}\n\nSent from the contact form on one-world-relief.org.`,
    }),
  });

  if (!response.ok) {
    console.error(`Contact email failed: ${await response.text()}`);
    return json({ detail: "Your message couldn't be sent right now.", fallback: "mailto" }, 502);
  }

  return json({ status: "sent" });
};
