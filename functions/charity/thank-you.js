export const onRequestGet = async () => {
  return new Response(
    `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>One World Relief | Thank You</title>
        <link rel="stylesheet" href="/one-world-relief.css" />
      </head>
      <body class="site-body">
        <main class="page-hero">
          <div class="container page-hero-content">
            <p class="eyebrow">Thank You</p>
            <h1>Your donation checkout was completed.</h1>
            <p class="lead">Thank you for supporting One World Relief. Your gift helps turn donor support into visible projects.</p>
            <div class="hero-actions">
              <a class="button button-primary" href="/projects.html">View Projects</a>
              <a class="button button-outline" href="/">Back Home</a>
            </div>
          </div>
        </main>
      </body>
    </html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
};
