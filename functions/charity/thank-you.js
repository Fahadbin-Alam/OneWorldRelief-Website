const escapeHtml = (value) => {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

export const onRequestGet = async ({ request }) => {
  const url = new URL(request.url);
  const amount = Number(url.searchParams.get("amount") || 0);
  const campaign = url.searchParams.get("campaign") || "";
  const project = url.searchParams.get("project") || "";
  const monthly = url.searchParams.get("frequency") === "monthly";

  const cause = project || campaign;
  const amountLabel = amount > 0
    ? `$${amount.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })}${monthly ? " a month" : ""}`
    : "";

  const summaryHtml = amountLabel
    ? `<div class="thank-you-summary">
        <strong>${escapeHtml(amountLabel)}</strong>
        <p>${cause ? `to ${escapeHtml(cause)}` : "to One World Relief"}${monthly ? ". Your first payment has gone through, and the next one comes in a month." : ""}</p>
      </div>`
    : "";

  const siteUrl = `${url.origin}/`;
  const shareText = cause
    ? `I just supported ${cause} with One World Relief. Join me:`
    : "I just donated to One World Relief. Join me:";
  const encodedText = encodeURIComponent(shareText);
  const encodedUrl = encodeURIComponent(siteUrl);

  return new Response(
    `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>One World Relief | Thank You</title>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="/one-world-relief.css" />
      </head>
      <body class="site-body">
        <main class="page-hero">
          <div class="container page-hero-content">
            <p class="eyebrow">Thank You</p>
            <h1>Your donation went through.</h1>
            ${summaryHtml}
            <p class="lead">Thank you for supporting One World Relief. Stripe will email your receipt. Your gift helps turn donor support into visible projects.</p>
            <p class="lead">Know someone who would give too? Sharing is the easiest way to double your impact.</p>
            <div class="share-row" aria-label="Share your donation">
              <a class="button button-primary" href="https://wa.me/?text=${encodedText}%20${encodedUrl}" target="_blank" rel="noreferrer">Share on WhatsApp</a>
              <a class="button button-outline" href="https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}" target="_blank" rel="noreferrer">Share on Facebook</a>
              <a class="button button-outline" href="https://twitter.com/intent/tweet?text=${encodedText}&amp;url=${encodedUrl}" target="_blank" rel="noreferrer">Share on X</a>
              <button class="button button-outline" type="button" id="copyLink">Copy link</button>
            </div>
            <div class="hero-actions">
              <a class="button button-outline" href="/projects.html">See the projects</a>
              <a class="button button-outline" href="/">Back Home</a>
            </div>
          </div>
        </main>
        <script>
          (function () {
            var button = document.getElementById("copyLink");
            if (!button || !navigator.clipboard) { return; }
            button.addEventListener("click", function () {
              navigator.clipboard.writeText(${JSON.stringify(siteUrl)}).then(function () {
                button.textContent = "Link copied";
                setTimeout(function () { button.textContent = "Copy link"; }, 2000);
              });
            });
          })();
        </script>
      </body>
    </html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
};
