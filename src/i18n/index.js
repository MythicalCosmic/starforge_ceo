import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';

// Executive/resource views are currently complete in English only. Keeping the
// selector single-language avoids presenting a partially translated product;
// Uzbek and Russian source files remain staged for a future complete rollout,
// but are deliberately excluded from the production bundle until then.
export const LANGUAGES = ['en'];

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    lng: 'en',
    fallbackLng: 'en',
    supportedLngs: LANGUAGES,
    interpolation: { escapeValue: false },
  });

function syncDocumentLanguage(language) {
  if (typeof document === 'undefined') return;
  const normalized = String(language || 'en').split('-')[0];
  document.documentElement.lang = LANGUAGES.includes(normalized) ? normalized : 'en';
}

i18n.on('languageChanged', syncDocumentLanguage);
syncDocumentLanguage(i18n.resolvedLanguage || i18n.language);
