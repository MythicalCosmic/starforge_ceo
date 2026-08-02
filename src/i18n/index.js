import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import uz from './locales/uz.json';
import ru from './locales/ru.json';
import en from './locales/en.json';

// Executive/resource views are currently complete in English only. Keeping the
// selector single-language avoids presenting a partially translated product;
// Uzbek and Russian resources remain staged for a future complete rollout.
export const LANGUAGES = ['en'];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      uz: { translation: uz },
      ru: { translation: ru },
      en: { translation: en },
    },
    fallbackLng: 'en',
    supportedLngs: LANGUAGES,
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'sf-lang',
      caches: ['localStorage'],
    },
  });

function syncDocumentLanguage(language) {
  if (typeof document === 'undefined') return;
  const normalized = String(language || 'en').split('-')[0];
  document.documentElement.lang = LANGUAGES.includes(normalized) ? normalized : 'en';
}

i18n.on('languageChanged', syncDocumentLanguage);
syncDocumentLanguage(i18n.resolvedLanguage || i18n.language);
