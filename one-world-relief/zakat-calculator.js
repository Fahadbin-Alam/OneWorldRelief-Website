// One World Relief private, browser-only Zakat al-mal estimator.
(function (global) {
  "use strict";

  const VERSION = "owr-zakat-v1";
  const RATES = Object.freeze({ hijri: 0.025, solar: 0.02577 });
  const NISAB_GRAMS = Object.freeze({ gold: 87.48, silver: 612.36 });
  const ASSET_IDS = Object.freeze([
    "cashSavings",
    "goldSilver",
    "investments",
    "moneyOwed",
    "businessAssets",
    "otherAssets",
  ]);

  const toAmount = (value) => {
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
  };

  const roundCurrency = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

  const calculateNisab = (basis, value) => {
    const currentValue = toAmount(value);
    if (basis === "custom") {
      return currentValue;
    }
    return NISAB_GRAMS[basis] ? roundCurrency(NISAB_GRAMS[basis] * currentValue) : 0;
  };

  const calculate = (input = {}) => {
    const assetValues = Array.isArray(input.assets)
      ? input.assets
      : Object.values(input.assets || {});
    const totalAssets = roundCurrency(assetValues.reduce((total, value) => total + toAmount(value), 0));
    const liabilities = roundCurrency(toAmount(input.liabilities));
    const netWealth = roundCurrency(Math.max(0, totalAssets - liabilities));
    const yearBasis = input.yearBasis === "solar" ? "solar" : "hijri";
    const rate = RATES[yearBasis];
    const nisab = calculateNisab(input.nisabBasis, input.nisabValue);
    const eligible = nisab > 0 && netWealth >= nisab;
    const zakatDue = eligible ? roundCurrency(netWealth * rate) : 0;

    return Object.freeze({
      totalAssets,
      liabilities,
      netWealth,
      nisab,
      yearBasis,
      rate,
      eligible,
      zakatDue,
    });
  };

  const api = Object.freeze({
    VERSION,
    RATES,
    NISAB_GRAMS,
    ASSET_IDS,
    calculateNisab,
    calculate,
    getNisab: calculateNisab,
    calculateEstimate: calculate,
  });
  global.ONE_WORLD_RELIEF_ZAKAT_CALCULATOR = api;

  if (typeof document === "undefined") {
    return;
  }

  const translations = {
    en: {
      pageTitle: "Calculate Your Zakat | One World Relief",
      homeAriaLabel: "One World Relief Home",
      mainNavigation: "Main navigation",
      navProjects: "Projects",
      navZakat: "Zakat",
      navAbout: "About",
      navContact: "Contact",
      navDonate: "Donate now",
      language: "Language",
      heroEyebrow: "A private, simple estimate",
      heroTitle: "Calculate your Zakat",
      heroIntro: "Zakat is an obligatory act of worship for Muslims who meet its conditions. If your zakatable wealth has reached the nisab and a full Hijri year has passed, Zakat al-mal is generally 2.5% of your net zakatable wealth.",
      startCalculator: "Start calculator",
      featureListLabel: "Calculator features",
      featurePrivate: "Your financial entries stay on this device",
      featureLanguages: "English, Bangla, Urdu, and Arabic",
      featureReturn: "Continue directly to secure giving",
      importantTitle: "Before you begin",
      importantCopy: "Use values from your Zakat due date. Gold and silver prices change daily, and scholars differ over which nisab standard applies, so choose the standard you follow or enter a trusted current threshold.",
      calculatorEyebrow: "Zakat al-mal calculator",
      calculatorTitle: "Your Zakat, step by step",
      calculatorIntro: "Three short steps. Enter only the amounts that apply to you.",
      localBadge: "Calculated privately",
      settingsLegend: "Choose your calculation basis",
      yearBasisLabel: "Zakat year",
      yearHijri: "Hijri / lunar year (2.5%)",
      yearSolar: "Gregorian / solar year (2.577%)",
      nisabBasisLabel: "Nisab standard",
      nisabChoose: "Choose a standard",
      nisabSilver: "Silver (612.36 g)",
      nisabGold: "Gold (87.48 g)",
      nisabCustom: "Enter a trusted threshold",
      nisabGuidance: "The silver standard is commonly used in the Hanafi school; other scholarly approaches may use gold. Follow guidance you trust.",
      metalPriceLabel: "Today's metal price per gram in USD",
      goldPriceLabel: "Today's gold price per gram in USD",
      silverPriceLabel: "Today's silver price per gram in USD",
      amountPlaceholder: "0.00",
      metalPriceHelp: "Use a current price from a source you trust; no live market price is built in.",
      customNisabLabel: "Trusted nisab threshold in USD",
      assetsLegend: "Add what you own",
      assetsIntro: "Enter only the totals that apply to you. Leave the rest blank.",
      cashSavingsLabel: "Cash and bank savings",
      goldSilverLabel: "Gold and silver value",
      investmentsLabel: "Shares and investments",
      moneyOwedLabel: "Money owed to you that is expected back",
      businessAssetsLabel: "Business cash and goods held for sale",
      otherAssetsLabel: "Other zakatable assets",
      optionalAssetsTitle: "More assets",
      optionalLabel: "Optional",
      assetsHelpTitle: "What is usually left out?",
      assetsHelpCopy: "Usually do not include your primary home, personal-use car, clothing, household goods, or tools used for work. Rules can differ for personal jewellery, pensions, investments, and business assets.",
      liabilitiesLegend: "Subtract bills due soon",
      liabilitiesLabel: "Debts and bills due now or within the coming 12 months",
      liabilitiesHelp: "Do not enter an entire long-term mortgage or student-loan balance. Debt treatment differs, so seek guidance if unsure.",
      resultsEyebrow: "Your estimate",
      resultsTitle: "Your estimated Zakat",
      totalAssetsResultLabel: "Total assets",
      liabilitiesResultLabel: "Short-term liabilities",
      netWealthResultLabel: "Net zakatable wealth",
      nisabResultLabel: "Selected nisab",
      resultNeedsNisab: "Choose a nisab standard and enter its current value to see an estimate.",
      resultEnterMetal: "Enter today's price per gram to calculate the selected nisab.",
      resultEnterCustom: "Enter a trusted current nisab threshold to continue.",
      resultBelow: "Based on the figures entered, your net zakatable wealth is below the selected nisab.",
      resultDue: "Based on the figures entered, your net zakatable wealth meets the selected nisab.",
      invalidAmount: "Enter zero or a positive amount with no more than two decimal places.",
      minimumDonationNote: "Secure checkout accepts donations of $5 or more.",
      donateMyZakat: "Donate my Zakat",
      startOver: "Start over",
      privacyNote: "Only your estimated donation amount and non-sensitive calculator choices continue to the donation page. One World Relief does not save or send your asset and debt entries.",
      recipientsEyebrow: "Where Zakat may go",
      recipientsTitle: "Eight recipient categories",
      recipientsIntro: "The Qur'an (9:60) identifies eight categories. Eligibility must be assessed for each allocation.",
      recipientPoor: "The poor",
      recipientNeedy: "The needy",
      recipientAdministrators: "Zakat administrators",
      recipientReconciliation: "Those whose hearts are to be reconciled",
      recipientBondage: "Those in bondage",
      recipientDebt: "Those burdened by qualifying debt",
      recipientCause: "In the cause of Allah",
      recipientTraveller: "The stranded traveller",
      jewelleryEyebrow: "An important difference",
      jewelleryTitle: "Personal jewellery",
      jewelleryCopy: "Scholars differ about gold and silver jewellery kept for personal use. Enter it according to guidance from a scholar you trust.",
      fitrEyebrow: "A separate obligation",
      fitrTitle: "Zakat al-Fitr is different",
      fitrCopy: "This calculator covers Zakat al-mal only. It does not calculate Zakat al-Fitr, crops, livestock, minerals, or other categories with different rules.",
      disclaimerEyebrow: "Please read",
      disclaimerTitle: "An estimate, not a fatwa",
      disclaimerCopy: "This calculator provides an educational estimate. Rules can vary according to your school of Islamic law and personal circumstances. Consult a qualified scholar or trusted Zakat specialist for complex or uncertain cases.",
      sourcesTitle: "Guidance sources",
      sourceQuran: "Qur'an 9:60: eligible recipient categories",
      sourceIslamicRelief: "Islamic Relief UK: Zakat and nisab",
      sourceMuslimHands: "Muslim Hands: calculation rules",
      sourceNzfSolar: "National Zakat Foundation: solar-year rate",
      sourceNzfNisab: "National Zakat Foundation: how nisab works",
      footerHome: "Home",
    },
    bn: {
      pageTitle: "আপনার যাকাত হিসাব করুন | One World Relief",
      homeAriaLabel: "One World Relief হোম",
      mainNavigation: "প্রধান নেভিগেশন",
      navProjects: "প্রকল্প",
      navZakat: "যাকাত",
      navAbout: "আমাদের সম্পর্কে",
      navContact: "যোগাযোগ",
      navDonate: "দান করুন",
      language: "ভাষা",
      heroEyebrow: "ব্যক্তিগত ও সহজ আনুমানিক হিসাব",
      heroTitle: "আপনার যাকাত হিসাব করুন",
      heroIntro: "যাকাতের শর্ত পূরণকারী মুসলিমদের জন্য যাকাত একটি ফরজ ইবাদত। আপনার যাকাতযোগ্য সম্পদ নিসাবে পৌঁছালে এবং তার ওপর এক পূর্ণ হিজরি বছর অতিক্রান্ত হলে, সাধারণভাবে নিট যাকাতযোগ্য সম্পদের ২.৫% যাকাতুল-মাল দিতে হয়।",
      startCalculator: "হিসাব শুরু করুন",
      featureListLabel: "ক্যালকুলেটরের সুবিধা",
      featurePrivate: "আপনার আর্থিক তথ্য এই ডিভাইসেই থাকে",
      featureLanguages: "ইংরেজি, বাংলা, উর্দু ও আরবি",
      featureReturn: "সরাসরি নিরাপদ অনুদান পাতায় যান",
      importantTitle: "শুরু করার আগে",
      importantCopy: "আপনার যাকাত দেওয়ার তারিখের মূল্য ব্যবহার করুন। সোনা ও রুপার দাম প্রতিদিন বদলায় এবং কোন নিসাব মান প্রযোজ্য তা নিয়ে আলেমদের মতভেদ আছে। আপনি যে মান অনুসরণ করেন তা বেছে নিন অথবা বিশ্বস্ত বর্তমান সীমা লিখুন।",
      calculatorEyebrow: "যাকাতুল-মাল ক্যালকুলেটর",
      calculatorTitle: "ধাপে ধাপে আপনার যাকাত",
      calculatorIntro: "তিনটি ছোট ধাপ। শুধু আপনার ক্ষেত্রে প্রযোজ্য পরিমাণ লিখুন।",
      localBadge: "ব্যক্তিগতভাবে হিসাব করা হয়",
      settingsLegend: "হিসাবের ভিত্তি বেছে নিন",
      yearBasisLabel: "যাকাতের বছর",
      yearHijri: "হিজরি / চন্দ্র বছর (২.৫%)",
      yearSolar: "গ্রেগরিয়ান / সৌর বছর (২.৫৭৭%)",
      nisabBasisLabel: "নিসাবের মানদণ্ড",
      nisabChoose: "একটি মানদণ্ড বেছে নিন",
      nisabSilver: "রুপা (৬১২.৩৬ গ্রাম)",
      nisabGold: "সোনা (৮৭.৪৮ গ্রাম)",
      nisabCustom: "বিশ্বস্ত সীমা লিখুন",
      nisabGuidance: "হানাফি মাযহাবে সাধারণত রুপার মান ব্যবহার করা হয়; অন্যান্য আলেম সোনার মান ব্যবহার করতে পারেন। আপনার বিশ্বস্ত নির্দেশনা অনুসরণ করুন।",
      metalPriceLabel: "আজ প্রতি গ্রাম ধাতুর দাম (USD)",
      goldPriceLabel: "আজ প্রতি গ্রাম সোনার দাম (USD)",
      silverPriceLabel: "আজ প্রতি গ্রাম রুপার দাম (USD)",
      amountPlaceholder: "০.০০",
      metalPriceHelp: "বিশ্বস্ত উৎসের বর্তমান দাম ব্যবহার করুন; এখানে কোনো লাইভ বাজারদর যুক্ত নেই।",
      customNisabLabel: "বিশ্বস্ত বর্তমান নিসাব সীমা (USD)",
      assetsLegend: "আপনার যাকাতযোগ্য সম্পদ যোগ করুন",
      assetsIntro: "শুধু আপনার ক্ষেত্রে প্রযোজ্য মোট অঙ্ক লিখুন। বাকিগুলো ফাঁকা রাখুন।",
      cashSavingsLabel: "নগদ অর্থ ও ব্যাংক সঞ্চয়",
      goldSilverLabel: "সোনা ও রুপার মূল্য",
      investmentsLabel: "শেয়ার ও বিনিয়োগ",
      moneyOwedLabel: "ফেরত পাওয়ার সম্ভাবনা আছে এমন পাওনা",
      businessAssetsLabel: "ব্যবসার নগদ অর্থ ও বিক্রির জন্য রাখা পণ্য",
      otherAssetsLabel: "অন্যান্য যাকাতযোগ্য সম্পদ",
      optionalAssetsTitle: "আরও সম্পদ",
      optionalLabel: "ঐচ্ছিক",
      assetsHelpTitle: "সাধারণত কী বাদ থাকে?",
      assetsHelpCopy: "সাধারণত নিজের বাসস্থান, ব্যক্তিগত ব্যবহারের গাড়ি, পোশাক, ঘরের জিনিসপত্র বা কাজের সরঞ্জাম অন্তর্ভুক্ত করবেন না। ব্যক্তিগত অলংকার, পেনশন, বিনিয়োগ ও ব্যবসায়িক সম্পদের বিধান ভিন্ন হতে পারে।",
      liabilitiesLegend: "শিগগির পরিশোধযোগ্য দেনা বাদ দিন",
      liabilitiesLabel: "এখন বা আগামী ১২ মাসে পরিশোধযোগ্য ঋণ ও বিল",
      liabilitiesHelp: "দীর্ঘমেয়াদি বাড়ির ঋণ বা শিক্ষাঋণের পুরো বকেয়া লিখবেন না। ঋণের বিধান ভিন্ন হতে পারে, তাই সন্দেহ হলে পরামর্শ নিন।",
      resultsEyebrow: "আপনার আনুমানিক হিসাব",
      resultsTitle: "আপনার আনুমানিক যাকাত",
      totalAssetsResultLabel: "মোট সম্পদ",
      liabilitiesResultLabel: "স্বল্পমেয়াদি দায়",
      netWealthResultLabel: "নিট যাকাতযোগ্য সম্পদ",
      nisabResultLabel: "নির্বাচিত নিসাব",
      resultNeedsNisab: "আনুমানিক হিসাব দেখতে নিসাবের মানদণ্ড বেছে নিয়ে বর্তমান মূল্য লিখুন।",
      resultEnterMetal: "নির্বাচিত নিসাব হিসাব করতে আজকের প্রতি গ্রামের দাম লিখুন।",
      resultEnterCustom: "চালিয়ে যেতে বিশ্বস্ত বর্তমান নিসাব সীমা লিখুন।",
      resultBelow: "আপনার দেওয়া তথ্য অনুযায়ী নিট যাকাতযোগ্য সম্পদ নির্বাচিত নিসাবের নিচে।",
      resultDue: "আপনার দেওয়া তথ্য অনুযায়ী নিট যাকাতযোগ্য সম্পদ নির্বাচিত নিসাবে পৌঁছেছে।",
      invalidAmount: "শূন্য বা ধনাত্মক অঙ্ক লিখুন এবং সর্বোচ্চ দুই ঘর দশমিক ব্যবহার করুন।",
      minimumDonationNote: "নিরাপদ চেকআউটে ন্যূনতম অনুদান ৫ ডলার।",
      donateMyZakat: "আমার যাকাত দান করুন",
      startOver: "আবার শুরু করুন",
      privacyNote: "শুধু আনুমানিক অনুদানের পরিমাণ ও সংবেদনশীল নয় এমন হিসাবের পছন্দ অনুদান পাতায় যাবে। ওয়ান ওয়ার্ল্ড রিলিফ আপনার সম্পদ ও ঋণের তথ্য সংরক্ষণ বা পাঠায় না।",
      recipientsEyebrow: "যাকাত কোথায় দেওয়া যায়",
      recipientsTitle: "আট শ্রেণির প্রাপক",
      recipientsIntro: "কুরআন (৯:৬০) আটটি শ্রেণি উল্লেখ করেছে। প্রতিটি বরাদ্দের যোগ্যতা আলাদাভাবে যাচাই করতে হবে।",
      recipientPoor: "ফকির",
      recipientNeedy: "মিসকিন",
      recipientAdministrators: "যাকাত পরিচালনাকারী",
      recipientReconciliation: "যাদের হৃদয় সম্প্রীত করা উদ্দেশ্য",
      recipientBondage: "দাসত্ব বা বন্দিদশা থেকে মুক্তির জন্য",
      recipientDebt: "যোগ্য ঋণে জর্জরিত ব্যক্তি",
      recipientCause: "আল্লাহর পথে",
      recipientTraveller: "অসহায় মুসাফির",
      jewelleryEyebrow: "একটি গুরুত্বপূর্ণ মতভেদ",
      jewelleryTitle: "ব্যক্তিগত অলংকার",
      jewelleryCopy: "ব্যক্তিগত ব্যবহারের সোনা ও রুপার অলংকার সম্পর্কে আলেমদের মতভেদ আছে। বিশ্বস্ত আলেমের নির্দেশনা অনুযায়ী তা লিখুন।",
      fitrEyebrow: "আলাদা একটি বিধান",
      fitrTitle: "যাকাতুল-ফিতর আলাদা",
      fitrCopy: "এই ক্যালকুলেটর শুধু যাকাতুল-মালের জন্য। এটি যাকাতুল-ফিতর, ফসল, গবাদিপশু, খনিজ বা ভিন্ন বিধানের অন্য শ্রেণি হিসাব করে না।",
      disclaimerEyebrow: "অনুগ্রহ করে পড়ুন",
      disclaimerTitle: "আনুমানিক হিসাব, ফতোয়া নয়",
      disclaimerCopy: "এই ক্যালকুলেটরটি শুধু শিক্ষামূলক আনুমানিক হিসাব দেয়। মাযহাব ও ব্যক্তিগত পরিস্থিতি অনুযায়ী বিধান ভিন্ন হতে পারে। জটিল বা অস্পষ্ট ক্ষেত্রে একজন যোগ্য আলেম বা বিশ্বস্ত যাকাত বিশেষজ্ঞের পরামর্শ নিন।",
      sourcesTitle: "নির্দেশনার উৎস",
      sourceQuran: "কুরআন ৯:৬০: যাকাতের যোগ্য প্রাপক",
      sourceIslamicRelief: "Islamic Relief UK: যাকাত ও নিসাব",
      sourceMuslimHands: "Muslim Hands: হিসাবের বিধান",
      sourceNzfSolar: "National Zakat Foundation: সৌর বছরের হার",
      sourceNzfNisab: "National Zakat Foundation: নিসাব কীভাবে কাজ করে",
      footerHome: "হোম",
    },
    ur: {
      pageTitle: "اپنی زکوٰۃ کا حساب لگائیں | One World Relief",
      homeAriaLabel: "One World Relief ہوم",
      mainNavigation: "مرکزی نیویگیشن",
      navProjects: "منصوبے",
      navZakat: "زکوٰۃ",
      navAbout: "ہمارے بارے میں",
      navContact: "رابطہ",
      navDonate: "عطیہ دیں",
      language: "زبان",
      heroEyebrow: "نجی اور آسان تخمینہ",
      heroTitle: "اپنی زکوٰۃ کا حساب لگائیں",
      heroIntro: "زکوٰۃ ان مسلمانوں پر فرض عبادت ہے جن پر اس کی شرائط پوری ہوتی ہوں۔ اگر آپ کا قابلِ زکوٰۃ مال نصاب تک پہنچ جائے اور اس پر ایک مکمل ہجری سال گزر جائے تو عموماً خالص قابلِ زکوٰۃ مال کا 2.5% زکوٰۃ المال ادا کرنا ہوتا ہے۔",
      startCalculator: "حساب شروع کریں",
      featureListLabel: "کیلکولیٹر کی خصوصیات",
      featurePrivate: "آپ کی مالی معلومات اسی ڈیوائس پر رہتی ہیں",
      featureLanguages: "انگریزی، بنگلہ، اردو اور عربی",
      featureReturn: "براہِ راست محفوظ عطیہ کے صفحے پر جائیں",
      importantTitle: "شروع کرنے سے پہلے",
      importantCopy: "اپنی زکوٰۃ کی مقررہ تاریخ کی قدریں استعمال کریں۔ سونے اور چاندی کی قیمتیں روز بدلتی ہیں اور نصاب کے معیار میں اہلِ علم کی آرا مختلف ہیں، اس لیے اپنے معتبر معیار کا انتخاب کریں یا قابلِ اعتماد موجودہ حد درج کریں۔",
      calculatorEyebrow: "زکوٰۃ المال کیلکولیٹر",
      calculatorTitle: "آپ کی زکوٰۃ، مرحلہ وار",
      calculatorIntro: "تین مختصر مراحل۔ صرف وہ رقوم درج کریں جو آپ پر لاگو ہوتی ہیں۔",
      localBadge: "حساب نجی طور پر ہوتا ہے",
      settingsLegend: "حساب کی بنیاد منتخب کریں",
      yearBasisLabel: "زکوٰۃ کا سال",
      yearHijri: "ہجری / قمری سال (2.5%)",
      yearSolar: "عیسوی / شمسی سال (2.577%)",
      nisabBasisLabel: "نصاب کا معیار",
      nisabChoose: "ایک معیار منتخب کریں",
      nisabSilver: "چاندی (612.36 گرام)",
      nisabGold: "سونا (87.48 گرام)",
      nisabCustom: "قابلِ اعتماد حد درج کریں",
      nisabGuidance: "حنفی فقہ میں عموماً چاندی کا معیار استعمال ہوتا ہے؛ دیگر علمی آرا میں سونے کا معیار استعمال ہو سکتا ہے۔ معتبر رہنمائی پر عمل کریں۔",
      metalPriceLabel: "آج دھات کی فی گرام قیمت (USD)",
      goldPriceLabel: "آج سونے کی فی گرام قیمت (USD)",
      silverPriceLabel: "آج چاندی کی فی گرام قیمت (USD)",
      amountPlaceholder: "0.00",
      metalPriceHelp: "کسی معتبر ذریعے کی موجودہ قیمت استعمال کریں؛ اس میں براہِ راست بازار کی قیمت شامل نہیں۔",
      customNisabLabel: "قابلِ اعتماد موجودہ حدِ نصاب (USD)",
      assetsLegend: "اپنے قابلِ زکوٰۃ اثاثے شامل کریں",
      assetsIntro: "صرف وہ مجموعی رقوم درج کریں جو آپ پر لاگو ہوتی ہیں۔ باقی خالی چھوڑ دیں۔",
      cashSavingsLabel: "نقد رقم اور بینک کی بچت",
      goldSilverLabel: "سونے اور چاندی کی مالیت",
      investmentsLabel: "حصص اور سرمایہ کاری",
      moneyOwedLabel: "قابلِ وصول قرض جس کی واپسی متوقع ہو",
      businessAssetsLabel: "کاروباری نقدی اور فروخت کے لیے موجود سامان",
      otherAssetsLabel: "دیگر قابلِ زکوٰۃ اثاثے",
      optionalAssetsTitle: "مزید اثاثے",
      optionalLabel: "اختیاری",
      assetsHelpTitle: "عام طور پر کیا شامل نہیں ہوتا؟",
      assetsHelpCopy: "عام طور پر اپنا رہائشی گھر، ذاتی استعمال کی گاڑی، کپڑے، گھریلو سامان یا کام کے اوزار شامل نہ کریں۔ ذاتی زیورات، پنشن، سرمایہ کاری اور کاروباری اثاثوں کے احکام مختلف ہو سکتے ہیں۔",
      liabilitiesLegend: "جلد واجب الادا قرض منہا کریں",
      liabilitiesLabel: "ابھی یا اگلے 12 ماہ میں واجب الادا قرض اور بل",
      liabilitiesHelp: "طویل مدتی رہن یا تعلیمی قرض کی پوری باقی رقم درج نہ کریں۔ قرض کے احکام مختلف ہیں، اس لیے شبہ ہو تو رہنمائی لیں۔",
      resultsEyebrow: "آپ کا تخمینہ",
      resultsTitle: "آپ کی تخمینی زکوٰۃ",
      totalAssetsResultLabel: "کل اثاثے",
      liabilitiesResultLabel: "قلیل مدتی واجبات",
      netWealthResultLabel: "خالص قابلِ زکوٰۃ مال",
      nisabResultLabel: "منتخب نصاب",
      resultNeedsNisab: "تخمینہ دیکھنے کے لیے نصاب کا معیار منتخب کرکے اس کی موجودہ قیمت درج کریں۔",
      resultEnterMetal: "منتخب نصاب کا حساب کرنے کے لیے آج کی فی گرام قیمت درج کریں۔",
      resultEnterCustom: "جاری رکھنے کے لیے قابلِ اعتماد موجودہ حدِ نصاب درج کریں۔",
      resultBelow: "درج کردہ معلومات کے مطابق آپ کا خالص قابلِ زکوٰۃ مال منتخب نصاب سے کم ہے۔",
      resultDue: "درج کردہ معلومات کے مطابق آپ کا خالص قابلِ زکوٰۃ مال منتخب نصاب تک پہنچتا ہے۔",
      invalidAmount: "صفر یا مثبت رقم درج کریں اور اعشاریہ کے بعد زیادہ سے زیادہ دو ہندسے رکھیں۔",
      minimumDonationNote: "محفوظ چیک آؤٹ میں کم از کم عطیہ 5 ڈالر ہے۔",
      donateMyZakat: "اپنی زکوٰۃ عطیہ کریں",
      startOver: "دوبارہ شروع کریں",
      privacyNote: "صرف تخمینی عطیہ اور غیر حساس حسابی انتخاب عطیہ کے صفحے تک جاتے ہیں۔ One World Relief آپ کے اثاثوں اور قرضوں کی تفصیلات محفوظ یا ارسال نہیں کرتا۔",
      recipientsEyebrow: "زکوٰۃ کہاں دی جا سکتی ہے",
      recipientsTitle: "مستحقین کی آٹھ اقسام",
      recipientsIntro: "قرآن (9:60) میں آٹھ اقسام بیان ہوئی ہیں۔ ہر مختص رقم کے لیے اہلیت الگ جانچی جانی چاہیے۔",
      recipientPoor: "فقیر",
      recipientNeedy: "مسکین",
      recipientAdministrators: "زکوٰۃ کے عاملین",
      recipientReconciliation: "تالیفِ قلب کے مستحق",
      recipientBondage: "غلامی یا قید سے رہائی",
      recipientDebt: "مستحق مقروض",
      recipientCause: "اللہ کی راہ میں",
      recipientTraveller: "ضرورت مند مسافر",
      jewelleryEyebrow: "ایک اہم اختلاف",
      jewelleryTitle: "ذاتی زیورات",
      jewelleryCopy: "ذاتی استعمال کے سونے اور چاندی کے زیورات کے بارے میں اہلِ علم کی آرا مختلف ہیں۔ اپنے معتبر عالم کی رہنمائی کے مطابق انہیں شامل کریں۔",
      fitrEyebrow: "ایک الگ ذمہ داری",
      fitrTitle: "زکوٰۃ الفطر الگ ہے",
      fitrCopy: "یہ کیلکولیٹر صرف زکوٰۃ المال کے لیے ہے۔ یہ زکوٰۃ الفطر، فصلوں، مویشیوں، معدنیات یا مختلف احکام والی دوسری اقسام کا حساب نہیں کرتا۔",
      disclaimerEyebrow: "براہِ کرم پڑھیں",
      disclaimerTitle: "تخمینہ ہے، فتویٰ نہیں",
      disclaimerCopy: "یہ کیلکولیٹر صرف ایک تعلیمی تخمینہ فراہم کرتا ہے۔ فقہی مسلک اور ذاتی حالات کے مطابق احکام مختلف ہو سکتے ہیں۔ پیچیدہ یا غیر واضح صورتِ حال میں کسی مستند عالم یا قابلِ اعتماد زکوٰۃ ماہر سے مشورہ کریں۔",
      sourcesTitle: "رہنمائی کے ذرائع",
      sourceQuran: "قرآن 9:60: زکوٰۃ کے مستحقین",
      sourceIslamicRelief: "Islamic Relief UK: زکوٰۃ اور نصاب",
      sourceMuslimHands: "Muslim Hands: حساب کے احکام",
      sourceNzfSolar: "National Zakat Foundation: شمسی سال کی شرح",
      sourceNzfNisab: "National Zakat Foundation: نصاب کیسے کام کرتا ہے",
      footerHome: "ہوم",
    },
    ar: {
      pageTitle: "احسب زكاتك | One World Relief",
      homeAriaLabel: "الصفحة الرئيسية لـ One World Relief",
      mainNavigation: "التنقل الرئيسي",
      navProjects: "المشاريع",
      navZakat: "الزكاة",
      navAbout: "من نحن",
      navContact: "اتصل بنا",
      navDonate: "تبرع",
      language: "اللغة",
      heroEyebrow: "تقدير بسيط وخاص",
      heroTitle: "احسب زكاتك",
      heroIntro: "الزكاة عبادة واجبة على المسلم الذي تتوافر فيه شروط الوجوب. إذا بلغ مالك الزكوي النصاب ومضى عليه حول هجري كامل، فتكون زكاة المال عادةً 2.5% من صافي الأموال الزكوية.",
      startCalculator: "ابدأ الحساب",
      featureListLabel: "مزايا الحاسبة",
      featurePrivate: "تبقى بياناتك المالية على هذا الجهاز",
      featureLanguages: "الإنجليزية والبنغالية والأردية والعربية",
      featureReturn: "انتقل مباشرةً إلى التبرع الآمن",
      importantTitle: "قبل أن تبدأ",
      importantCopy: "استخدم القيم في يوم استحقاق زكاتك. تتغير أسعار الذهب والفضة يوميًا، ويختلف العلماء في معيار النصاب المطبق؛ فاختر المعيار الذي تتبعه أو أدخل حدًا حاليًا من مصدر موثوق.",
      calculatorEyebrow: "حاسبة زكاة المال",
      calculatorTitle: "زكاتك، خطوة بخطوة",
      calculatorIntro: "ثلاث خطوات قصيرة. أدخل فقط المبالغ التي تنطبق عليك.",
      localBadge: "يُحسب بخصوصية",
      settingsLegend: "اختر أساس الحساب",
      yearBasisLabel: "سنة الزكاة",
      yearHijri: "السنة الهجرية / القمرية (2.5%)",
      yearSolar: "السنة الميلادية / الشمسية (2.577%)",
      nisabBasisLabel: "معيار النصاب",
      nisabChoose: "اختر معيارًا",
      nisabSilver: "الفضة (612.36 غرامًا)",
      nisabGold: "الذهب (87.48 غرامًا)",
      nisabCustom: "أدخل حدًا موثوقًا",
      nisabGuidance: "يشيع استخدام معيار الفضة في المذهب الحنفي، وقد تستخدم آراء فقهية أخرى معيار الذهب. اتبع الإرشاد الذي تثق به.",
      metalPriceLabel: "سعر المعدن اليوم للغرام بالدولار",
      goldPriceLabel: "سعر الذهب اليوم للغرام بالدولار",
      silverPriceLabel: "سعر الفضة اليوم للغرام بالدولار",
      amountPlaceholder: "0.00",
      metalPriceHelp: "استخدم سعرًا حاليًا من مصدر تثق به؛ لا تتضمن الحاسبة سعر سوق مباشرًا.",
      customNisabLabel: "حد النصاب الحالي الموثوق بالدولار",
      assetsLegend: "أضف أموالك الزكوية",
      assetsIntro: "أدخل فقط المبالغ الإجمالية التي تنطبق عليك، واترك الباقي فارغًا.",
      cashSavingsLabel: "النقد والمدخرات المصرفية",
      goldSilverLabel: "قيمة الذهب والفضة",
      investmentsLabel: "الأسهم والاستثمارات",
      moneyOwedLabel: "الديون المرجو سدادها لك",
      businessAssetsLabel: "النقد التجاري والبضاعة المعدة للبيع",
      otherAssetsLabel: "أموال زكوية أخرى",
      optionalAssetsTitle: "أصول إضافية",
      optionalLabel: "اختياري",
      assetsHelpTitle: "ما الذي لا يُدرج عادةً؟",
      assetsHelpCopy: "لا تُدرج عادةً مسكنك الأساسي، أو سيارتك للاستعمال الشخصي، أو ملابسك، أو أثاث منزلك، أو أدوات عملك. وقد تختلف أحكام الحلي الشخصية والمعاشات والاستثمارات وأموال التجارة.",
      liabilitiesLegend: "اطرح الديون المستحقة قريبًا",
      liabilitiesLabel: "الديون والفواتير المستحقة الآن أو خلال 12 شهرًا القادمة",
      liabilitiesHelp: "لا تدخل كامل رصيد رهن عقاري أو قرض دراسي طويل الأجل. تختلف أحكام الديون، فاستشر أهل العلم إذا لم تكن متأكدًا.",
      resultsEyebrow: "تقديرك",
      resultsTitle: "زكاتك التقديرية",
      totalAssetsResultLabel: "إجمالي الأموال",
      liabilitiesResultLabel: "الالتزامات القصيرة الأجل",
      netWealthResultLabel: "صافي الأموال الزكوية",
      nisabResultLabel: "النصاب المختار",
      resultNeedsNisab: "اختر معيار النصاب وأدخل قيمته الحالية لعرض التقدير.",
      resultEnterMetal: "أدخل سعر الغرام اليوم لحساب النصاب المختار.",
      resultEnterCustom: "أدخل حد نصاب حاليًا موثوقًا للمتابعة.",
      resultBelow: "وفقًا للأرقام المدخلة، يقل صافي مالك الزكوي عن النصاب المختار.",
      resultDue: "وفقًا للأرقام المدخلة، بلغ صافي مالك الزكوي النصاب المختار.",
      invalidAmount: "أدخل صفرًا أو مبلغًا موجبًا، وبحد أقصى منزلتين عشريتين.",
      minimumDonationNote: "يقبل الدفع الآمن تبرعات بقيمة 5 دولارات أو أكثر.",
      donateMyZakat: "تبرع بزكاتي",
      startOver: "ابدأ من جديد",
      privacyNote: "لا ينتقل إلى صفحة التبرع إلا مبلغ التبرع التقديري وخيارات الحساب غير الحساسة. لا تحفظ One World Relief بيانات أموالك وديونك ولا ترسلها.",
      recipientsEyebrow: "مصارف الزكاة",
      recipientsTitle: "الأصناف الثمانية المستحقة",
      recipientsIntro: "حدد القرآن الكريم (9:60) ثمانية أصناف. ويجب التحقق من الاستحقاق لكل تخصيص.",
      recipientPoor: "الفقراء",
      recipientNeedy: "المساكين",
      recipientAdministrators: "العاملون على الزكاة",
      recipientReconciliation: "المؤلفة قلوبهم",
      recipientBondage: "في الرقاب",
      recipientDebt: "الغارمون المستحقون",
      recipientCause: "في سبيل الله",
      recipientTraveller: "ابن السبيل",
      jewelleryEyebrow: "مسألة فيها اختلاف",
      jewelleryTitle: "حلي الاستعمال الشخصي",
      jewelleryCopy: "تختلف أقوال العلماء في حلي الذهب والفضة المعدة للاستعمال الشخصي. فأدخلها وفق إرشاد عالم تثق به.",
      fitrEyebrow: "واجب منفصل",
      fitrTitle: "زكاة الفطر مختلفة",
      fitrCopy: "تغطي هذه الحاسبة زكاة المال فقط. ولا تحسب زكاة الفطر أو الزروع أو الأنعام أو المعادن أو الأنواع الأخرى ذات الأحكام المختلفة.",
      disclaimerEyebrow: "يرجى القراءة",
      disclaimerTitle: "تقدير وليست فتوى",
      disclaimerCopy: "تقدم هذه الحاسبة تقديرًا تعليميًا فقط. وقد تختلف الأحكام باختلاف المذهب والظروف الشخصية. استشر عالمًا مؤهلًا أو مختصًا موثوقًا بالزكاة في الحالات المعقدة أو غير الواضحة.",
      sourcesTitle: "مصادر الإرشاد",
      sourceQuran: "القرآن الكريم 9:60: أصناف مستحقي الزكاة",
      sourceIslamicRelief: "Islamic Relief UK: الزكاة والنصاب",
      sourceMuslimHands: "Muslim Hands: قواعد الحساب",
      sourceNzfSolar: "National Zakat Foundation: نسبة السنة الشمسية",
      sourceNzfNisab: "National Zakat Foundation: كيفية عمل النصاب",
      footerHome: "الرئيسية",
    },
  };

  const form = document.getElementById("zakatCalculator");
  if (!form) {
    return;
  }

  const languageSelect = document.getElementById("zakatLanguage");
  const yearBasis = document.getElementById("zakatYearBasis");
  const nisabBasis = document.getElementById("zakatNisabBasis");
  const metalPrice = document.getElementById("zakatMetalPrice");
  const customNisab = document.getElementById("zakatCustomNisab");
  const metalPriceField = document.getElementById("zakatMetalPriceField");
  const customNisabField = document.getElementById("zakatCustomNisabField");
  const metalPriceLabel = document.getElementById("zakatMetalPriceLabel");
  const liabilitiesInput = document.getElementById("shortTermLiabilities");
  const totalAssetsResult = document.getElementById("totalAssetsResult");
  const liabilitiesResult = document.getElementById("liabilitiesResult");
  const netWealthResult = document.getElementById("netWealthResult");
  const nisabResult = document.getElementById("nisabResult");
  const zakatDueResult = document.getElementById("zakatDueResult");
  const resultStatus = document.getElementById("zakatResultStatus");
  const resultAnnouncement = document.getElementById("zakatResultAnnouncement");
  const resultsPanel = form.querySelector(".zakat-results");
  const minimumNote = document.getElementById("zakatMinimumNote");
  const donateLink = document.getElementById("donateCalculatedZakat");
  const startLink = document.querySelector(".zakat-start-link");
  const amountInputs = [...form.querySelectorAll('input[type="number"]')];
  const HANDOFF_KEY = "owrZakatHandoff";
  const LANGUAGE_KEY = "owrZakatLanguage";
  const localeByLanguage = { en: "en-US", bn: "bn-BD", ur: "ur-PK", ar: "ar" };
  const rtlLanguages = new Set(["ur", "ar"]);
  let currentLanguage = "en";
  let latestResult = calculate();

  try {
    sessionStorage.removeItem(HANDOFF_KEY);
  } catch (_error) {
    // The calculator works without storage.
  }

  const copy = (key) => translations[currentLanguage]?.[key] || translations.en[key] || key;

  const formatUsd = (amount) => new Intl.NumberFormat(localeByLanguage[currentLanguage] || "en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));

  const getStoredLanguage = () => {
    try {
      const saved = localStorage.getItem(LANGUAGE_KEY);
      return translations[saved] ? saved : "en";
    } catch (_error) {
      return "en";
    }
  };

  const storeLanguage = (language) => {
    try {
      localStorage.setItem(LANGUAGE_KEY, language);
    } catch (_error) {
      // The language switch still works when storage is unavailable.
    }
  };

  const applyLanguage = (language) => {
    currentLanguage = translations[language] ? language : "en";
    const direction = rtlLanguages.has(currentLanguage) ? "rtl" : "ltr";
    document.documentElement.lang = currentLanguage;
    document.documentElement.dir = direction;
    document.title = copy("pageTitle");
    if (languageSelect) {
      languageSelect.value = currentLanguage;
    }

    document.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = copy(element.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
      element.placeholder = copy(element.dataset.i18nPlaceholder);
    });
    document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
      element.setAttribute("aria-label", copy(element.dataset.i18nAriaLabel));
    });
    updateNisabFields();
    calculateAndRender();
    storeLanguage(currentLanguage);
  };

  const updateNisabFields = () => {
    const basis = nisabBasis?.value || "";
    const usesMetal = basis === "gold" || basis === "silver";
    if (metalPriceField) {
      metalPriceField.hidden = !usesMetal;
    }
    if (customNisabField) {
      customNisabField.hidden = basis !== "custom";
    }
    if (metalPriceLabel && usesMetal) {
      metalPriceLabel.textContent = copy(basis === "gold" ? "goldPriceLabel" : "silverPriceLabel");
    }
  };

  const getNisabValue = () => nisabBasis?.value === "custom"
    ? customNisab?.value
    : metalPrice?.value;

  const updateAmountValidity = () => {
    let hasInvalidAmount = false;

    amountInputs.forEach((input) => {
      const fieldIsActive = !input.disabled && !input.closest("[hidden]");
      const isInvalid = fieldIsActive && input.value !== "" && !input.validity.valid;
      const inputWrap = input.closest(".zakat-money-input");
      let error = document.getElementById(`${input.id}Error`);

      if (!error) {
        error = document.createElement("small");
        error.id = `${input.id}Error`;
        error.className = "zakat-field-error";
        error.hidden = true;
        inputWrap?.insertAdjacentElement("afterend", error);
      }

      error.textContent = copy("invalidAmount");
      error.hidden = !isInvalid;
      if (isInvalid) {
        input.setAttribute("aria-invalid", "true");
      } else {
        input.removeAttribute("aria-invalid");
      }
      inputWrap?.classList.toggle("has-error", isInvalid);

      const descriptionIds = new Set((input.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
      if (isInvalid) {
        descriptionIds.add(error.id);
        hasInvalidAmount = true;
      } else {
        descriptionIds.delete(error.id);
      }
      if (descriptionIds.size) {
        input.setAttribute("aria-describedby", [...descriptionIds].join(" "));
      } else {
        input.removeAttribute("aria-describedby");
      }
    });

    return !hasInvalidAmount;
  };

  const setDonationLink = (result, amountsAreValid) => {
    const canContinue = amountsAreValid && result.eligible && result.zakatDue >= 5;
    if (minimumNote) {
      minimumNote.hidden = !(amountsAreValid && result.eligible && result.zakatDue > 0 && result.zakatDue < 5);
    }
    if (!donateLink) {
      return;
    }
    donateLink.setAttribute("aria-disabled", canContinue ? "false" : "true");
    donateLink.classList.toggle("is-disabled", !canContinue);
    donateLink.href = canContinue
      ? `donate.html?program=zakat&amount=${result.zakatDue.toFixed(2)}&source=zakat-calculator#donationForm`
      : "donate.html?program=zakat";
  };

  const calculateAndRender = () => {
    const basis = nisabBasis?.value || "";
    const amountsAreValid = updateAmountValidity();
    latestResult = calculate({
      assets: ASSET_IDS.map((id) => document.getElementById(id)?.value),
      liabilities: liabilitiesInput?.value,
      yearBasis: yearBasis?.value,
      nisabBasis: basis,
      nisabValue: getNisabValue(),
    });

    totalAssetsResult.textContent = formatUsd(latestResult.totalAssets);
    if (liabilitiesResult) {
      liabilitiesResult.textContent = formatUsd(latestResult.liabilities);
    }
    netWealthResult.textContent = formatUsd(latestResult.netWealth);
    nisabResult.textContent = latestResult.nisab > 0 ? formatUsd(latestResult.nisab) : "—";
    zakatDueResult.textContent = formatUsd(latestResult.zakatDue);

    let resultState = "waiting";
    if (!amountsAreValid) {
      resultStatus.textContent = copy("invalidAmount");
      resultState = "invalid";
    } else if (!basis) {
      resultStatus.textContent = copy("resultNeedsNisab");
    } else if (latestResult.nisab <= 0) {
      resultStatus.textContent = copy(basis === "custom" ? "resultEnterCustom" : "resultEnterMetal");
    } else {
      resultStatus.textContent = copy(latestResult.eligible ? "resultDue" : "resultBelow");
      resultState = latestResult.eligible ? "due" : "below";
    }
    resultStatus.dataset.state = resultState;
    if (resultsPanel) {
      resultsPanel.dataset.state = resultState;
    }
    if (resultAnnouncement) {
      resultAnnouncement.textContent = `${resultStatus.textContent} ${copy("resultsTitle")}: ${formatUsd(latestResult.zakatDue)}`;
    }
    setDonationLink(latestResult, amountsAreValid);
  };

  const storeHandoff = () => {
    const context = {
      version: VERSION,
      language: currentLanguage,
      year_basis: yearBasis?.value === "solar" ? "solar" : "hijri",
      nisab_basis: ["gold", "silver", "custom"].includes(nisabBasis?.value) ? nisabBasis.value : "",
    };
    try {
      sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(context));
    } catch (_error) {
      // The amount remains in the URL if session storage is unavailable.
    }
  };

  const moveToCalculator = () => {
    const scrollContainer = document.scrollingElement || document.documentElement;
    const headerHeight = document.querySelector(".site-header")?.getBoundingClientRect().height || 0;
    const targetTop = Math.max(0, form.getBoundingClientRect().top + scrollContainer.scrollTop - headerHeight - 16);
    scrollContainer.scrollTop = targetTop;
  };

  languageSelect?.addEventListener("change", () => applyLanguage(languageSelect.value));
  startLink?.addEventListener("click", (event) => {
    event.preventDefault();
    moveToCalculator();
    form.focus({ preventScroll: true });
  });
  nisabBasis?.addEventListener("change", () => {
    updateNisabFields();
    calculateAndRender();
  });
  form.addEventListener("input", calculateAndRender);
  form.addEventListener("change", calculateAndRender);
  form.addEventListener("reset", () => {
    try {
      sessionStorage.removeItem(HANDOFF_KEY);
    } catch (_error) {
      // Nothing sensitive is retained if storage is unavailable.
    }
    global.setTimeout(() => {
      updateNisabFields();
      calculateAndRender();
      moveToCalculator();
      form.focus({ preventScroll: true });
    }, 0);
  });
  donateLink?.addEventListener("click", (event) => {
    if (!updateAmountValidity() || !latestResult.eligible || latestResult.zakatDue < 5) {
      event.preventDefault();
      return;
    }
    storeHandoff();
  });

  applyLanguage(getStoredLanguage());
})(typeof window !== "undefined" ? window : globalThis);
