export const onRequestGet = async () => {
  return new Response(
    `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>One World Relief | Donation Cancelled</title>
        <link rel="stylesheet" href="/one-world-relief.css" />
      </head>
      <body class="site-body">
        <main class="page-hero">
          <div class="container page-hero-content">
            <p class="eyebrow">Donation Cancelled</p>
            <h1>No donation was completed.</h1>
            <p class="lead">You can return to the donation page whenever you are ready.</p>
            <div class="hero-actions">
              <a class="button button-primary" href="/donate.html">Donate</a>
              <a class="button button-outline" href="/">Back Home</a>
            </div>
          </div>
        </main>
      </body>
    </html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
};
