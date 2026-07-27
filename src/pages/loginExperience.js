const ENGLISH_PROMPTS = [
  {
    id: 'clarity',
    eyebrow: 'Direction starts with you',
    lead: 'Lead with clarity.',
    accent: 'Move with confidence.',
    body: 'Start with the strongest signal, then open the detail behind it.',
    tip: 'Name the one decision only you can make today.',
  },
  {
    id: 'focus',
    eyebrow: 'Focus creates momentum',
    lead: 'Fewer priorities.',
    accent: 'Better execution.',
    body: 'Focus turns limited time, money, and attention into organizational force.',
    tip: 'If everything is urgent, your team cannot see what matters.',
  },
  {
    id: 'standards',
    eyebrow: 'Standards shape culture',
    lead: 'Raise the bar,',
    accent: 'then build the ladder.',
    body: 'Great standards work only when every leader knows how to reach them.',
    tip: 'Pair every expectation with a clear owner and the support to deliver.',
  },
  {
    id: 'learning',
    eyebrow: 'Decide, observe, improve',
    lead: 'Choose clearly.',
    accent: 'Learn quickly.',
    body: 'A reversible decision made today can teach more than another week of debate.',
    tip: 'Separate reversible choices from the decisions that truly need more time.',
  },
  {
    id: 'ownership',
    eyebrow: 'Clarity makes progress visible',
    lead: 'Make ownership',
    accent: 'visible.',
    body: 'Every important result needs one accountable leader and one measurable next move.',
    tip: 'End every meeting with one owner, one outcome, and one date.',
  },
  {
    id: 'time',
    eyebrow: 'Your calendar teaches the company',
    lead: 'Protect time for',
    accent: 'what matters.',
    body: 'Your calendar quietly shows the entire organization what is truly important.',
    tip: 'Reserve your sharpest hour for strategy before the day fills itself.',
  },
  {
    id: 'truth',
    eyebrow: 'Healthy companies surface risk early',
    lead: 'Reward the',
    accent: 'early truth.',
    body: 'Risks are easiest to solve when people feel safe enough to name them early.',
    tip: 'Thank the person who brings difficult news before asking how to fix it.',
  },
  {
    id: 'leaders',
    eyebrow: 'Leadership should multiply',
    lead: 'Build leaders,',
    accent: 'not followers.',
    body: 'Delegate outcomes, define guardrails, and let capable people surprise you.',
    tip: 'Give context and authority together; either one alone creates friction.',
  },
];

const UZBEK_PROMPTS = [
  {
    id: 'clarity',
    eyebrow: 'Yo‘nalish sizdan boshlanadi',
    lead: 'Aniqlik bilan yetaklang.',
    accent: 'Ishonch bilan yuring.',
    body: 'Avval eng muhim signalni ko‘ring, so‘ng uning ortidagi tafsilotni oching.',
    tip: 'Bugun faqat siz qabul qila oladigan bitta qarorni belgilang.',
  },
  {
    id: 'focus',
    eyebrow: 'Diqqat sur’at yaratadi',
    lead: 'Ustuvorliklar kamroq.',
    accent: 'Natija kuchliroq.',
    body: 'Aniq diqqat cheklangan vaqt, mablag‘ va e’tiborni tashkilot kuchiga aylantiradi.',
    tip: 'Hammasi shoshilinch bo‘lsa, jamoa muhim narsani ko‘ra olmaydi.',
  },
  {
    id: 'standards',
    eyebrow: 'Mezonlar madaniyatni shakllantiradi',
    lead: 'Mezonni ko‘taring,',
    accent: 'unga eltuvchi yo‘lni quring.',
    body: 'Yuqori mezon har bir rahbar unga qanday yetishni bilganidagina ishlaydi.',
    tip: 'Har bir kutilmani aniq mas’ul va uni bajarish uchun yordam bilan bog‘lang.',
  },
  {
    id: 'learning',
    eyebrow: 'Qaror qiling, kuzating, yaxshilang',
    lead: 'Aniq tanlang.',
    accent: 'Tez o‘rganing.',
    body: 'Bugun qabul qilingan qaytariladigan qaror yana bir haftalik bahsdan ko‘proq saboq beradi.',
    tip: 'Qaytariladigan tanlovlarni chindan ham ko‘proq vaqt talab qiladigan qarorlardan ajrating.',
  },
  {
    id: 'ownership',
    eyebrow: 'Aniqlik taraqqiyotni ko‘rsatadi',
    lead: 'Mas’uliyatni',
    accent: 'ko‘rinadigan qiling.',
    body: 'Har bir muhim natijaga bitta mas’ul rahbar va bitta o‘lchanadigan keyingi qadam kerak.',
    tip: 'Har bir uchrashuvni bitta mas’ul, bitta natija va bitta sana bilan yakunlang.',
  },
  {
    id: 'time',
    eyebrow: 'Taqvimingiz kompaniyaga saboq beradi',
    lead: 'Vaqtni',
    accent: 'muhim ishlar uchun asrang.',
    body: 'Taqvimingiz butun tashkilotga aslida nima muhimligini sezdirmay ko‘rsatadi.',
    tip: 'Kunning eng sergak soatini boshqa ishlar to‘ldirishidan oldin strategiyaga ajrating.',
  },
  {
    id: 'truth',
    eyebrow: 'Sog‘lom kompaniya xavfni erta ko‘radi',
    lead: 'Haqiqatni',
    accent: 'erta aytganlarni qadrlang.',
    body: 'Odamlar xavfni erta aytishga jur’at qilsa, uni hal qilish ancha oson bo‘ladi.',
    tip: 'Qiyin xabar keltirgan odamdan yechim so‘rashdan oldin unga rahmat ayting.',
  },
  {
    id: 'leaders',
    eyebrow: 'Yetakchilik ko‘payishi kerak',
    lead: 'Ergashuvchilar emas,',
    accent: 'yetakchilarni tarbiyalang.',
    body: 'Natijani topshiring, chegaralarni belgilang va qobiliyatli odamlarning kuchini oching.',
    tip: 'Vazifa bilan birga kontekst va vakolatni ham bering.',
  },
];

const RUSSIAN_PROMPTS = [
  {
    id: 'clarity',
    eyebrow: 'Направление начинается с вас',
    lead: 'Руководите ясно.',
    accent: 'Двигайтесь уверенно.',
    body: 'Сначала найдите самый важный сигнал, затем раскройте стоящие за ним детали.',
    tip: 'Назовите одно решение, которое сегодня можете принять только вы.',
  },
  {
    id: 'focus',
    eyebrow: 'Фокус создаёт импульс',
    lead: 'Меньше приоритетов.',
    accent: 'Сильнее исполнение.',
    body: 'Фокус превращает ограниченные время, деньги и внимание в силу организации.',
    tip: 'Если срочно всё, команда перестаёт видеть действительно важное.',
  },
  {
    id: 'standards',
    eyebrow: 'Стандарты формируют культуру',
    lead: 'Поднимайте планку,',
    accent: 'и стройте путь к ней.',
    body: 'Высокие стандарты работают, только когда каждый лидер понимает, как их достичь.',
    tip: 'К каждому ожиданию добавляйте ответственного и необходимую поддержку.',
  },
  {
    id: 'learning',
    eyebrow: 'Решайте, наблюдайте, улучшайте',
    lead: 'Решайте ясно.',
    accent: 'Учитесь быстро.',
    body: 'Обратимое решение сегодня может научить большему, чем ещё одна неделя обсуждений.',
    tip: 'Отделяйте обратимые выборы от решений, которым действительно нужно больше времени.',
  },
  {
    id: 'ownership',
    eyebrow: 'Ясность делает прогресс видимым',
    lead: 'Сделайте ответственность',
    accent: 'видимой.',
    body: 'Каждому важному результату нужен один ответственный лидер и следующий измеримый шаг.',
    tip: 'Завершайте встречу одним ответственным, одним результатом и одной датой.',
  },
  {
    id: 'time',
    eyebrow: 'Ваш календарь обучает компанию',
    lead: 'Берегите время',
    accent: 'для самого важного.',
    body: 'Ваш календарь незаметно показывает всей организации, что важно на самом деле.',
    tip: 'Отдайте свой самый продуктивный час стратегии, пока день не заполнил себя сам.',
  },
  {
    id: 'truth',
    eyebrow: 'Здоровая компания рано замечает риск',
    lead: 'Цените',
    accent: 'раннюю правду.',
    body: 'Риски проще решать, когда людям безопасно говорить о них заранее.',
    tip: 'Поблагодарите за сложную новость прежде, чем спрашивать о решении.',
  },
  {
    id: 'leaders',
    eyebrow: 'Лидерство должно умножаться',
    lead: 'Развивайте лидеров,',
    accent: 'а не последователей.',
    body: 'Делегируйте результаты, задавайте границы и позволяйте сильным людям удивлять вас.',
    tip: 'Передавайте контекст и полномочия вместе — по отдельности они создают трение.',
  },
];

export const LOGIN_PROMPTS = Object.freeze({
  en: ENGLISH_PROMPTS,
  uz: UZBEK_PROMPTS,
  ru: RUSSIAN_PROMPTS,
});

export function normalizeLoginLanguage(language) {
  const normalized = String(language || 'uz').toLowerCase().split('-')[0];
  return Object.hasOwn(LOGIN_PROMPTS, normalized) ? normalized : 'uz';
}

export function choosePromptIndex(seed, count, previousIndex = -1) {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError('Prompt count must be a positive integer.');
  }

  const numericSeed = Number.isFinite(Number(seed)) ? Math.abs(Math.trunc(Number(seed))) : 0;
  let index = numericSeed % count;
  if (count > 1 && index === previousIndex) index = (index + 1) % count;
  return index;
}

function randomSeed() {
  try {
    const values = new Uint32Array(1);
    globalThis.crypto?.getRandomValues?.(values);
    if (values[0] !== undefined) return values[0];
  } catch {
    /* Fall back to Math.random when secure randomness is unavailable. */
  }
  return Math.floor(Math.random() * 0x1_0000_0000);
}

function choosePagePromptIndex() {
  const count = ENGLISH_PROMPTS.length;
  let previousIndex = -1;

  try {
    const stored = globalThis.sessionStorage?.getItem('sf-login-prompt-index');
    if (stored !== null && stored !== undefined && stored !== '') {
      const parsed = Number.parseInt(stored, 10);
      if (Number.isInteger(parsed) && parsed >= 0 && parsed < count) previousIndex = parsed;
    }
  } catch {
    /* Private browsing may make session storage unavailable. */
  }

  const index = choosePromptIndex(randomSeed(), count, previousIndex);
  try {
    globalThis.sessionStorage?.setItem('sf-login-prompt-index', String(index));
  } catch {
    /* The selection still remains stable for this module load. */
  }
  return index;
}

export const PAGE_PROMPT_INDEX = choosePagePromptIndex();

export function getLoginPrompt(language, index = PAGE_PROMPT_INDEX) {
  const locale = normalizeLoginLanguage(language);
  const prompts = LOGIN_PROMPTS[locale];
  return prompts[((index % prompts.length) + prompts.length) % prompts.length];
}
