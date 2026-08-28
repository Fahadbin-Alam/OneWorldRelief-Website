export const onRequestGet = async () => {
  return new Response(
    `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>One World Relief | Thank You</title>
        <link rel="stylesheet" href="/one-world-relief.css" />
        <style>
          body {
            min-height: 100vh;
            min-height: 100dvh;
            overflow-x: hidden;
            overflow-y: auto;
            background:
              radial-gradient(circle at 50% 24%, rgba(47, 159, 137, 0.16), transparent 28%),
              radial-gradient(circle at 50% 72%, rgba(77, 149, 194, 0.14), transparent 34%),
              linear-gradient(180deg, #f9fdff 0%, #e9f6fb 100%);
          }

          body::before,
          body::after {
            animation: none;
          }

          .thank-you-stage {
            width: 100%;
            min-height: 100vh;
            min-height: 100dvh;
            display: grid;
            place-items: center;
            padding:
              max(1rem, env(safe-area-inset-top))
              max(0.75rem, env(safe-area-inset-right))
              max(1rem, env(safe-area-inset-bottom))
              max(0.75rem, env(safe-area-inset-left));
            text-align: center;
          }

          .success-card {
            position: relative;
            width: min(100%, 720px);
            display: grid;
            gap: clamp(0.9rem, 3vw, 1.5rem);
            place-items: center;
            padding: clamp(1.5rem, 6vw, 3.5rem);
            border: 1px solid rgba(255, 255, 255, 0.76);
            border-radius: clamp(24px, 5vw, 42px);
            background:
              linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(248, 253, 255, 0.72)),
              radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.94), transparent 54%);
            box-shadow: 0 28px 90px rgba(45, 91, 122, 0.16);
          }

          .check-wrap {
            position: relative;
            width: clamp(104px, 25vw, 180px);
            aspect-ratio: 1;
            display: grid;
            place-items: center;
            margin-bottom: 0.35rem;
            border: 1px solid rgba(24, 52, 71, 0.08);
            border-radius: 50%;
            background:
              radial-gradient(circle at 35% 28%, #fff, rgba(255, 255, 255, 0.88) 54%, rgba(233, 247, 251, 0.92)),
              #fff;
            box-shadow:
              0 22px 60px rgba(45, 91, 122, 0.16),
              inset 0 0 0 10px rgba(47, 159, 137, 0.07);
            animation: badge-enter 760ms cubic-bezier(0.2, 1, 0.32, 1) both;
          }

          .check-wrap::before,
          .check-wrap::after {
            content: "";
            position: absolute;
            inset: -10px;
            border: 2px solid rgba(47, 159, 137, 0.18);
            border-radius: 50%;
            animation: ring-breathe 2.4s ease-in-out 3;
          }

          .check-wrap::after {
            inset: -22px;
            border-color: rgba(77, 149, 194, 0.14);
            animation-delay: 0.25s;
          }

          .check-icon {
            width: 58%;
            height: 58%;
            overflow: visible;
          }

          .check-icon circle {
            fill: none;
            stroke: rgba(47, 159, 137, 0.16);
            stroke-width: 7;
          }

          .check-icon path {
            fill: none;
            stroke: #2f9f89;
            stroke-width: 11;
            stroke-linecap: round;
            stroke-linejoin: round;
            stroke-dasharray: 96;
            stroke-dashoffset: 96;
            animation: draw-check 680ms cubic-bezier(0.2, 1, 0.32, 1) 340ms forwards;
          }

          .thank-you-stage h1 {
            max-width: 12ch;
            margin: 0;
            color: var(--ink);
            font-size: clamp(2.35rem, 10vw, 5.8rem);
            line-height: 0.96;
            text-wrap: balance;
            animation: title-arrive 850ms cubic-bezier(0.22, 1, 0.36, 1) both;
          }

          .success-message {
            max-width: 46ch;
            margin: 0;
            color: var(--ink-soft);
            font-size: clamp(0.98rem, 3vw, 1.12rem);
            line-height: 1.65;
          }

          .success-actions {
            width: min(100%, 430px);
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.7rem;
          }

          .success-actions .button {
            min-width: 0;
            min-height: 48px;
          }

          .success-note {
            margin: 0;
            color: #58788c;
            font-size: 0.78rem;
            line-height: 1.5;
          }

          @keyframes badge-enter {
            0% { opacity: 0; transform: translateY(18px) scale(0.78); }
            62% { opacity: 1; transform: translateY(0) scale(1.04); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
          }

          @keyframes ring-breathe {
            0%, 100% { transform: scale(0.98); opacity: 0.58; }
            50% { transform: scale(1.04); opacity: 1; }
          }

          @keyframes draw-check {
            to { stroke-dashoffset: 0; }
          }

          @keyframes title-arrive {
            from { opacity: 0; transform: translateY(14px); filter: blur(6px); }
            to { opacity: 1; transform: translateY(0); filter: blur(0); }
          }

          @media (max-width: 480px) {
            .success-card {
              padding: 1.6rem 1rem;
            }

            .success-actions {
              grid-template-columns: 1fr;
            }
          }

          @media (max-height: 480px) and (orientation: landscape) {
            .thank-you-stage {
              place-items: start center;
              padding-block: max(0.6rem, env(safe-area-inset-top)) max(0.6rem, env(safe-area-inset-bottom));
            }

            .success-card {
              grid-template-columns: auto minmax(0, 1fr);
              justify-items: start;
              gap: 0.55rem 1.2rem;
              padding: 1rem 1.25rem;
              text-align: left;
            }

            .check-wrap {
              width: 88px;
              grid-row: 1 / span 4;
              margin: 0;
            }

            .thank-you-stage h1 {
              max-width: none;
              font-size: clamp(2rem, 7vw, 3.2rem);
            }

            .success-message {
              line-height: 1.4;
            }

            .success-actions {
              width: 100%;
              max-width: 420px;
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .check-wrap,
            .check-wrap::before,
            .check-wrap::after,
            .check-icon path,
            .thank-you-stage h1 {
              animation: none;
            }

            .check-icon path {
              stroke-dashoffset: 0;
            }
          }
        </style>
      </head>
      <body class="site-body">
        <main class="thank-you-stage" aria-labelledby="thankYouTitle">
          <section class="success-card">
            <div class="check-wrap" aria-hidden="true">
              <svg class="check-icon" viewBox="0 0 120 120" focusable="false">
                <circle cx="60" cy="60" r="48"></circle>
                <path d="M35 62 L52 78 L86 42"></path>
              </svg>
            </div>
            <h1 id="thankYouTitle">Thank you for your donation.</h1>
            <p class="success-message">Your secure checkout is complete. Your generosity helps One World Relief continue verified, direct aid work.</p>
            <div class="success-actions">
              <a class="button button-primary" href="/">Back home</a>
              <a class="button button-outline" href="/projects.html">View projects</a>
            </div>
            <p class="success-note">Stripe will email your payment confirmation to the address used at checkout.</p>
          </section>
        </main>
      </body>
    </html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
};
