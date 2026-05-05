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
          }

          .thank-you-stage {
            width: min(1080px, calc(100vw - 2rem));
            min-height: min(760px, calc(100vh - 2rem));
            display: grid;
            grid-template-rows: auto 1fr;
            place-items: center;
            gap: clamp(1rem, 3vw, 2rem);
            text-align: center;
          }

          .thank-you-stage h1 {
            max-width: 11ch;
            margin: 0;
            color: var(--ink);
            font-size: clamp(4.2rem, 12vw, 9.5rem);
            line-height: 0.9;
            animation: title-settle 4.8s ease-in-out infinite;
          }

          .story-scene {
            position: relative;
            width: min(94vw, 860px);
            height: clamp(320px, 46vw, 470px);
            overflow: hidden;
            border-radius: 30px;
            background:
              radial-gradient(circle at 72% 18%, rgba(255, 209, 98, 0.9) 0 42px, transparent 44px),
              linear-gradient(180deg, #dcebf4 0%, #edf8fb 56%, #d8edf3 100%);
            box-shadow: 0 32px 80px rgba(24, 52, 71, 0.18);
            animation: sky-hope 4.8s ease-in-out infinite;
          }

          .story-scene::before {
            content: "";
            position: absolute;
            inset: 0;
            background:
              linear-gradient(115deg, rgba(23, 52, 71, 0.28), transparent 48%),
              radial-gradient(circle at 22% 18%, rgba(39, 78, 103, 0.25), transparent 30%);
            animation: storm-lift 4.8s ease-in-out infinite;
          }

          .cloud {
            position: absolute;
            top: 44px;
            left: 54px;
            width: 168px;
            height: 54px;
            border-radius: 999px;
            background: #8da3b0;
            opacity: 0.8;
            filter: drop-shadow(0 12px 16px rgba(24, 52, 71, 0.18));
            animation: cloud-drift 4.8s ease-in-out infinite;
          }

          .cloud::before,
          .cloud::after {
            content: "";
            position: absolute;
            bottom: 20px;
            border-radius: 50%;
            background: inherit;
          }

          .cloud::before {
            left: 28px;
            width: 70px;
            height: 70px;
          }

          .cloud::after {
            right: 24px;
            width: 82px;
            height: 82px;
          }

          .rain {
            position: absolute;
            top: 108px;
            left: 74px;
            width: 112px;
            height: 108px;
            background: repeating-linear-gradient(105deg, transparent 0 17px, rgba(77, 149, 194, 0.72) 18px 21px, transparent 22px 34px);
            opacity: 0.72;
            animation: rain-fade 4.8s ease-in-out infinite;
          }

          .ground {
            position: absolute;
            left: 8%;
            right: 8%;
            bottom: 48px;
            height: 20px;
            border-radius: 999px;
            background: rgba(77, 149, 194, 0.18);
          }

          .person {
            position: absolute;
            bottom: 66px;
            width: 142px;
            height: 214px;
          }

          .donor {
            left: 10%;
            animation: donor-reach 4.8s ease-in-out infinite;
          }

          .child {
            right: 10%;
            animation: child-rise 4.8s ease-in-out infinite;
          }

          .head {
            position: absolute;
            top: 0;
            left: 39px;
            width: 64px;
            height: 64px;
            border-radius: 50%;
            background: #f3c59d;
            box-shadow: inset -8px -10px rgba(139, 77, 44, 0.14);
          }

          .hair {
            position: absolute;
            top: -6px;
            left: 32px;
            width: 78px;
            height: 38px;
            border-radius: 999px 999px 18px 18px;
            background: #173447;
            z-index: 2;
          }

          .face {
            position: absolute;
            top: 25px;
            left: 51px;
            width: 40px;
            height: 28px;
            z-index: 3;
          }

          .face::before,
          .face::after {
            content: "";
            position: absolute;
            top: 0;
            width: 6px;
            height: 8px;
            border-radius: 50%;
            background: #173447;
          }

          .face::before {
            left: 7px;
          }

          .face::after {
            right: 7px;
          }

          .mouth {
            position: absolute;
            left: 11px;
            bottom: 0;
            width: 18px;
            height: 9px;
            border-top: 4px solid #173447;
            border-radius: 999px 999px 0 0;
          }

          .child .mouth {
            animation: smile-change 4.8s ease-in-out infinite;
          }

          .tear {
            position: absolute;
            top: 35px;
            left: 57px;
            width: 7px;
            height: 12px;
            border-radius: 50% 50% 60% 60%;
            background: #4d95c2;
            z-index: 4;
            animation: tear-dry 4.8s ease-in-out infinite;
          }

          .body {
            position: absolute;
            top: 76px;
            left: 27px;
            width: 88px;
            height: 106px;
            border-radius: 30px 30px 20px 20px;
            background: linear-gradient(145deg, var(--blue-500), var(--blue-700));
            box-shadow: inset -12px -14px rgba(24, 52, 71, 0.1);
          }

          .child .body {
            background: linear-gradient(145deg, #4d95c2, #256f96);
            animation: child-color 4.8s ease-in-out infinite;
          }

          .heart {
            position: absolute;
            top: 102px;
            left: 61px;
            width: 20px;
            height: 20px;
            background: #f0b54d;
            opacity: 0;
            transform: rotate(45deg) scale(0.6);
            animation: heart-glow 4.8s ease-in-out infinite;
            z-index: 4;
          }

          .heart::before,
          .heart::after {
            content: "";
            position: absolute;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: inherit;
          }

          .heart::before {
            left: -10px;
          }

          .heart::after {
            top: -10px;
          }

          .arm {
            position: absolute;
            top: 92px;
            width: 72px;
            height: 18px;
            border-radius: 999px;
            background: #f3c59d;
            z-index: 5;
          }

          .donor .arm {
            right: -22px;
            transform-origin: left center;
            animation: donor-arm 4.8s ease-in-out infinite;
          }

          .child .arm {
            left: -22px;
            transform-origin: right center;
            animation: child-arm 4.8s ease-in-out infinite;
          }

          .leg {
            position: absolute;
            bottom: 0;
            width: 22px;
            height: 50px;
            border-radius: 999px;
            background: #173447;
          }

          .leg-one {
            left: 42px;
          }

          .leg-two {
            right: 42px;
          }

          .coin {
            position: absolute;
            top: 178px;
            left: 23%;
            width: 64px;
            height: 64px;
            display: grid;
            place-items: center;
            border-radius: 50%;
            color: #7b530f;
            background: radial-gradient(circle at 32% 28%, #fff4af, #e0af3f 54%, #a56b0d 100%);
            box-shadow: 0 18px 36px rgba(164, 113, 20, 0.34);
            font-size: 1.9rem;
            font-weight: 900;
            z-index: 8;
            animation: coin-gift 4.8s cubic-bezier(0.55, 0, 0.22, 1) infinite;
          }

          .spark {
            position: absolute;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #f0b54d;
            opacity: 0;
            z-index: 9;
            animation: sparkle 4.8s ease-in-out infinite;
          }

          .spark-one {
            top: 164px;
            left: 66%;
          }

          .spark-two {
            top: 214px;
            left: 71%;
            animation-delay: 0.1s;
          }

          .spark-three {
            top: 134px;
            left: 76%;
            animation-delay: 0.2s;
          }

          @keyframes title-settle {
            0%, 100% { transform: translateY(0); }
            45%, 72% { transform: translateY(-6px); }
          }

          @keyframes sky-hope {
            0%, 20% { filter: saturate(0.75) brightness(0.9); }
            56%, 100% { filter: saturate(1.08) brightness(1.03); }
          }

          @keyframes storm-lift {
            0%, 26% { opacity: 1; }
            62%, 100% { opacity: 0; }
          }

          @keyframes cloud-drift {
            0%, 30% { transform: translateX(0); opacity: 0.82; }
            68%, 100% { transform: translateX(-34px); opacity: 0; }
          }

          @keyframes rain-fade {
            0%, 28% { opacity: 0.72; transform: translateY(0); }
            60%, 100% { opacity: 0; transform: translateY(18px); }
          }

          @keyframes donor-reach {
            0%, 100% { transform: translateY(0); }
            42%, 64% { transform: translateY(-8px); }
          }

          @keyframes child-rise {
            0%, 24% { transform: translateY(18px) scale(0.96); }
            58%, 100% { transform: translateY(0) scale(1); }
          }

          @keyframes donor-arm {
            0%, 22% { transform: rotate(-6deg); }
            38%, 58% { transform: rotate(-24deg) translateX(8px); }
            78%, 100% { transform: rotate(-10deg); }
          }

          @keyframes child-arm {
            0%, 28% { transform: rotate(28deg); }
            50%, 76% { transform: rotate(-18deg) translateX(-8px); }
            92%, 100% { transform: rotate(-6deg); }
          }

          @keyframes smile-change {
            0%, 36% {
              border-top: 4px solid #173447;
              border-bottom: 0;
              border-radius: 999px 999px 0 0;
              transform: translateY(0);
            }
            58%, 100% {
              border-top: 0;
              border-bottom: 4px solid #173447;
              border-radius: 0 0 999px 999px;
              transform: translateY(-1px);
            }
          }

          @keyframes tear-dry {
            0%, 30% { opacity: 1; transform: translateY(0); }
            52%, 100% { opacity: 0; transform: translateY(18px) scale(0.5); }
          }

          @keyframes child-color {
            0%, 36% { filter: saturate(0.68) brightness(0.82); }
            60%, 100% { filter: saturate(1.2) brightness(1.08); }
          }

          @keyframes heart-glow {
            0%, 45% { opacity: 0; transform: rotate(45deg) scale(0.4); }
            62%, 100% { opacity: 1; transform: rotate(45deg) scale(1); }
          }

          @keyframes coin-gift {
            0%, 16% { transform: translate(0, 0) scale(0.94) rotateY(0deg); }
            42% { transform: translate(190px, -118px) scale(1.12) rotateY(560deg); }
            64%, 100% { transform: translate(392px, -18px) scale(0.74) rotateY(960deg); opacity: 0; }
          }

          @keyframes sparkle {
            0%, 48% { opacity: 0; transform: scale(0.2); }
            62% { opacity: 1; transform: scale(1.4); }
            86%, 100% { opacity: 0; transform: scale(0.25) translateY(-18px); }
          }

          @media (max-width: 680px) {
            .story-scene {
              height: 340px;
              border-radius: 22px;
            }

            .person {
              transform: scale(0.74);
              transform-origin: bottom center;
            }

            .donor {
              left: 2%;
            }

            .child {
              right: 2%;
            }

            .coin {
              width: 52px;
              height: 52px;
              top: 176px;
              left: 18%;
              font-size: 1.5rem;
            }

            @keyframes coin-gift {
              0%, 16% { transform: translate(0, 0) scale(0.94) rotateY(0deg); }
              42% { transform: translate(126px, -88px) scale(1.08) rotateY(560deg); }
              64%, 100% { transform: translate(244px, -12px) scale(0.7) rotateY(960deg); opacity: 0; }
            }
          }
        </style>
      </head>
      <body class="site-body">
        <main class="thank-you-stage" aria-label="Thank you donation confirmation">
          <h1>Thank you for your Donation</h1>
          <div class="story-scene" aria-hidden="true">
            <div class="cloud"></div>
            <div class="rain"></div>
            <div class="ground"></div>
            <div class="person donor">
              <div class="hair"></div>
              <div class="head"></div>
              <div class="face"><div class="mouth"></div></div>
              <div class="body"></div>
              <div class="arm"></div>
              <div class="leg leg-one"></div>
              <div class="leg leg-two"></div>
            </div>
            <div class="coin">$</div>
            <div class="spark spark-one"></div>
            <div class="spark spark-two"></div>
            <div class="spark spark-three"></div>
            <div class="person child">
              <div class="hair"></div>
              <div class="head"></div>
              <div class="face"><div class="mouth"></div></div>
              <div class="tear"></div>
              <div class="body"></div>
              <div class="heart"></div>
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
