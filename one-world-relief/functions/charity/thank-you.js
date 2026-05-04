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
          }

          .thank-you-stage {
            width: min(920px, calc(100vw - 2rem));
            display: grid;
            place-items: center;
            gap: clamp(1.8rem, 5vw, 3rem);
            text-align: center;
          }

          .thank-you-stage h1 {
            max-width: 12ch;
            margin: 0;
            color: var(--ink);
            font-size: clamp(4rem, 13vw, 9rem);
            line-height: 0.92;
          }

          .gift-scene {
            position: relative;
            width: min(92vw, 620px);
            height: 270px;
            overflow: hidden;
          }

          .ground {
            position: absolute;
            left: 12%;
            right: 8%;
            bottom: 30px;
            height: 18px;
            border-radius: 999px;
            background: rgba(77, 149, 194, 0.16);
          }

          .donor,
          .child {
            position: absolute;
            bottom: 44px;
            width: 112px;
            height: 150px;
          }

          .donor {
            left: 8%;
          }

          .child {
            right: 7%;
          }

          .head {
            position: absolute;
            top: 0;
            left: 31px;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: #f2c59f;
            box-shadow: inset -6px -8px rgba(164, 96, 55, 0.12);
          }

          .hair {
            position: absolute;
            top: -3px;
            left: 27px;
            width: 58px;
            height: 28px;
            border-radius: 999px 999px 14px 14px;
            background: #183447;
          }

          .body {
            position: absolute;
            top: 56px;
            left: 20px;
            width: 72px;
            height: 82px;
            border-radius: 24px 24px 18px 18px;
            background: linear-gradient(135deg, var(--blue-500), var(--blue-700));
          }

          .child .body {
            background: linear-gradient(135deg, #2f9f89, #247465);
          }

          .arm {
            position: absolute;
            top: 72px;
            width: 58px;
            height: 16px;
            border-radius: 999px;
            background: #f2c59f;
          }

          .donor .arm {
            right: -14px;
            transform: rotate(-16deg);
          }

          .child .arm {
            left: -14px;
            transform: rotate(16deg);
          }

          .leg {
            position: absolute;
            bottom: 0;
            width: 18px;
            height: 38px;
            border-radius: 999px;
            background: #183447;
          }

          .leg-one {
            left: 34px;
          }

          .leg-two {
            right: 34px;
          }

          .coin {
            position: absolute;
            top: 78px;
            left: 22%;
            width: 54px;
            height: 54px;
            display: grid;
            place-items: center;
            border-radius: 50%;
            color: #7c5410;
            background: radial-gradient(circle at 32% 28%, #fff1a5, #d7a536 58%, #a97114);
            box-shadow: 0 16px 28px rgba(164, 113, 20, 0.22);
            font-weight: 900;
            animation: coin-gift 2.35s ease-in-out infinite;
          }

          .spark {
            position: absolute;
            width: 9px;
            height: 9px;
            border-radius: 50%;
            background: var(--gold);
            opacity: 0;
            animation: sparkle 2.35s ease-in-out infinite;
          }

          .spark-one {
            top: 78px;
            left: 58%;
          }

          .spark-two {
            top: 118px;
            left: 66%;
            animation-delay: 0.18s;
          }

          @keyframes coin-gift {
            0% {
              transform: translate(0, 0) rotateY(0deg);
            }
            48% {
              transform: translate(178px, -44px) rotateY(540deg);
            }
            78%,
            100% {
              transform: translate(322px, 18px) rotateY(900deg);
            }
          }

          @keyframes sparkle {
            46% {
              opacity: 0;
              transform: scale(0.4);
            }
            62% {
              opacity: 1;
              transform: scale(1);
            }
            82%,
            100% {
              opacity: 0;
              transform: scale(0.3);
            }
          }

          @media (max-width: 640px) {
            .gift-scene {
              height: 230px;
              transform: scale(0.82);
              transform-origin: center;
            }

            @keyframes coin-gift {
              0% {
                transform: translate(0, 0) rotateY(0deg);
              }
              48% {
                transform: translate(128px, -36px) rotateY(540deg);
              }
              78%,
              100% {
                transform: translate(230px, 14px) rotateY(900deg);
              }
            }
          }
        </style>
      </head>
      <body class="site-body">
        <main class="thank-you-stage" aria-label="Thank you donation confirmation">
          <h1>Thank you for your Donation</h1>
          <div class="gift-scene" aria-hidden="true">
            <div class="ground"></div>
            <div class="donor">
              <div class="hair"></div>
              <div class="head"></div>
              <div class="body"></div>
              <div class="arm"></div>
              <div class="leg leg-one"></div>
              <div class="leg leg-two"></div>
            </div>
            <div class="coin">$</div>
            <div class="spark spark-one"></div>
            <div class="spark spark-two"></div>
            <div class="child">
              <div class="hair"></div>
              <div class="head"></div>
              <div class="body"></div>
              <div class="arm"></div>
              <div class="leg leg-one"></div>
              <div class="leg leg-two"></div>
            </div>
          </div>
        </main>
      </body>
    </html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
};
