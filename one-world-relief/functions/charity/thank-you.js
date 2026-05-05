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
              radial-gradient(circle at 50% 42%, rgba(77, 149, 194, 0.18), transparent 30%),
              linear-gradient(180deg, #f7fcff 0%, #eaf6fc 100%);
          }

          .thank-you-stage {
            position: relative;
            width: min(1100px, calc(100vw - 2rem));
            min-height: min(760px, calc(100vh - 2rem));
            display: grid;
            place-items: center;
            text-align: center;
            isolation: isolate;
          }

          .success-field {
            position: absolute;
            inset: 0;
            display: grid;
            place-items: center;
            pointer-events: none;
            z-index: -1;
          }

          .success-orbit {
            position: absolute;
            width: min(72vmin, 620px);
            aspect-ratio: 1;
            border-radius: 50%;
            border: 1px solid rgba(77, 149, 194, 0.2);
            background:
              radial-gradient(circle, rgba(255, 255, 255, 0.82) 0 26%, rgba(77, 149, 194, 0.12) 27% 28%, transparent 29%),
              conic-gradient(from 90deg, transparent, rgba(77, 149, 194, 0.28), transparent, rgba(47, 159, 137, 0.22), transparent);
            box-shadow:
              0 30px 90px rgba(45, 91, 122, 0.16),
              inset 0 0 80px rgba(255, 255, 255, 0.86);
            animation: success-orbit 8s linear infinite;
          }

          .success-orbit::before,
          .success-orbit::after {
            content: "";
            position: absolute;
            inset: 12%;
            border-radius: 50%;
            border: 1px solid rgba(215, 165, 54, 0.18);
            animation: success-pulse 3.6s ease-in-out infinite;
          }

          .success-orbit::after {
            inset: 24%;
            border-color: rgba(47, 159, 137, 0.22);
            animation-delay: 0.55s;
          }

          .success-mark {
            position: absolute;
            width: min(24vmin, 170px);
            aspect-ratio: 1;
            display: grid;
            place-items: center;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.82);
            box-shadow:
              0 24px 70px rgba(45, 91, 122, 0.18),
              inset 0 0 0 1px rgba(24, 52, 71, 0.08);
            animation: mark-enter 1.1s cubic-bezier(0.22, 1, 0.36, 1) both;
          }

          .success-mark::before {
            content: "";
            width: 46%;
            height: 26%;
            border-left: 10px solid #2f9f89;
            border-bottom: 10px solid #2f9f89;
            transform: rotate(-45deg) translate(4%, -8%);
            border-radius: 0 0 0 8px;
            animation: check-draw 1.35s cubic-bezier(0.22, 1, 0.36, 1) 0.25s both;
          }

          .light-sweep {
            position: absolute;
            width: 120vw;
            height: 42vh;
            border-radius: 999px;
            background: linear-gradient(90deg, transparent 16%, rgba(255, 255, 255, 0.72), rgba(215, 165, 54, 0.18), transparent 82%);
            transform: rotate(-11deg) translateX(-45vw);
            animation: sweep 4.8s ease-in-out infinite;
          }

          .thank-you-stage h1 {
            max-width: 11ch;
            margin: 0;
            color: var(--ink);
            font-size: clamp(4.4rem, 13vw, 10rem);
            line-height: 0.88;
            text-wrap: balance;
            animation: title-arrive 1.05s cubic-bezier(0.22, 1, 0.36, 1) both;
          }

          @keyframes success-orbit {
            to { transform: rotate(360deg); }
          }

          @keyframes success-pulse {
            0%, 100% { transform: scale(0.94); opacity: 0.48; }
            50% { transform: scale(1.08); opacity: 1; }
          }

          @keyframes mark-enter {
            from { opacity: 0; transform: translateY(24px) scale(0.72); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }

          @keyframes check-draw {
            from { clip-path: inset(100% 0 0 0); opacity: 0; }
            to { clip-path: inset(0 0 0 0); opacity: 1; }
          }

          @keyframes sweep {
            0%, 18% { transform: rotate(-11deg) translateX(-58vw); opacity: 0; }
            42%, 62% { opacity: 1; }
            100% { transform: rotate(-11deg) translateX(58vw); opacity: 0; }
          }

          @keyframes title-arrive {
            from { opacity: 0; transform: translateY(24px); filter: blur(10px); }
            to { opacity: 1; transform: translateY(0); filter: blur(0); }
          }

          @media (prefers-reduced-motion: reduce) {
            .success-orbit,
            .success-orbit::before,
            .success-orbit::after,
            .success-mark,
            .success-mark::before,
            .light-sweep,
            .thank-you-stage h1 {
              animation: none;
            }
          }
        </style>
      </head>
      <body class="site-body">
        <main class="thank-you-stage" aria-label="Thank you donation confirmation">
          <div class="success-field" aria-hidden="true">
            <div class="light-sweep"></div>
            <div class="success-orbit"></div>
            <div class="success-mark"></div>
          </div>
          <h1>Thank you for your Donation</h1>
        </main>
      </body>
    </html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
};
