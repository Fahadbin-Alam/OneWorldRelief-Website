export const onRequestGet = async () => {
  return new Response(
    `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>One World Relief | Thank You</title>
        <link rel="stylesheet" href="/one-world-relief.css" />
        <style>
          body {
            min-height: 100vh;
            display: grid;
            place-items: center;
            overflow: hidden;
            background:
              radial-gradient(circle at 50% 28%, rgba(47, 159, 137, 0.16), transparent 28%),
              radial-gradient(circle at 50% 70%, rgba(77, 149, 194, 0.14), transparent 34%),
              linear-gradient(180deg, #f9fdff 0%, #e9f6fb 100%);
          }

          .thank-you-stage {
            position: relative;
            width: min(1000px, calc(100vw - 2rem));
            min-height: min(720px, calc(100vh - 2rem));
            display: grid;
            gap: clamp(2rem, 6vw, 4rem);
            place-items: center;
            text-align: center;
            isolation: isolate;
          }

          .success-card {
            position: relative;
            display: grid;
            gap: clamp(1.8rem, 4vw, 3.2rem);
            place-items: center;
            padding: clamp(2rem, 6vw, 4.8rem);
          }

          .success-card::before {
            content: "";
            position: absolute;
            inset: 14% 2% 6%;
            z-index: -1;
            border-radius: 48px;
            background:
              linear-gradient(180deg, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.34)),
              radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.86), transparent 54%);
            box-shadow: 0 34px 120px rgba(45, 91, 122, 0.16);
          }

          .check-wrap {
            position: relative;
            width: min(36vmin, 260px);
            aspect-ratio: 1;
            display: grid;
            place-items: center;
            border-radius: 50%;
            background:
              radial-gradient(circle at 35% 28%, rgba(255, 255, 255, 0.98), rgba(255, 255, 255, 0.86) 54%, rgba(233, 247, 251, 0.9)),
              #fff;
            border: 1px solid rgba(24, 52, 71, 0.08);
            box-shadow:
              0 28px 80px rgba(45, 91, 122, 0.18),
              inset 0 0 0 12px rgba(47, 159, 137, 0.07);
            animation: badge-enter 900ms cubic-bezier(0.2, 1, 0.32, 1) both;
          }

          .check-wrap::before,
          .check-wrap::after {
            content: "";
            position: absolute;
            inset: -18px;
            border-radius: 50%;
            border: 2px solid rgba(47, 159, 137, 0.18);
            animation: ring-breathe 2.8s ease-in-out infinite;
          }

          .check-wrap::after {
            inset: -38px;
            border-color: rgba(77, 149, 194, 0.14);
            animation-delay: 0.35s;
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
            animation: draw-check 720ms cubic-bezier(0.2, 1, 0.32, 1) 420ms forwards;
          }

          .thank-you-stage h1 {
            max-width: 12ch;
            margin: 0;
            color: var(--ink);
            font-size: clamp(4rem, 12vw, 9.5rem);
            line-height: 0.92;
            text-wrap: balance;
            animation: title-arrive 1.05s cubic-bezier(0.22, 1, 0.36, 1) both;
          }

          @keyframes badge-enter {
            0% { opacity: 0; transform: translateY(22px) scale(0.72); }
            58% { opacity: 1; transform: translateY(0) scale(1.06); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
          }

          @keyframes ring-breathe {
            0%, 100% { transform: scale(0.98); opacity: 0.58; }
            50% { transform: scale(1.05); opacity: 1; }
          }

          @keyframes draw-check {
            to { stroke-dashoffset: 0; }
          }

          @keyframes title-arrive {
            from { opacity: 0; transform: translateY(18px); filter: blur(8px); }
            to { opacity: 1; transform: translateY(0); filter: blur(0); }
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
        <main class="thank-you-stage" aria-label="Thank you donation confirmation">
          <div class="success-card">
            <div class="check-wrap" aria-hidden="true">
              <svg class="check-icon" viewBox="0 0 120 120" focusable="false">
                <circle cx="60" cy="60" r="48"></circle>
                <path d="M35 62 L52 78 L86 42"></path>
              </svg>
            </div>
            <h1>Thank you for your Donation</h1>
          </div>
        </main>
      </body>
    </html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
};
