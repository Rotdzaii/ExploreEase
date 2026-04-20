import * as Localization from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { smartSearchResources, type SmartSearchSupportedLanguage } from './smartSearchResources';

const I18N_FALLBACK_LANGUAGE: SmartSearchSupportedLanguage = 'vi';
const i18n = createInstance();

const isSupportedLanguage = (value: string): value is SmartSearchSupportedLanguage => {
  return value === 'vi' || value === 'en' || value === 'ja';
};

export const normalizeSmartSearchLanguage = (input?: string | null): SmartSearchSupportedLanguage => {
  const normalized = String(input ?? '').trim().toLowerCase();
  if (isSupportedLanguage(normalized)) return normalized;
  return I18N_FALLBACK_LANGUAGE;
};

const detectDeviceLanguage = (): SmartSearchSupportedLanguage => {
  const locale = Localization.getLocales()?.[0];
  const languageCode = String(locale?.languageCode ?? '').trim().toLowerCase();
  return normalizeSmartSearchLanguage(languageCode);
};

if (!i18n.isInitialized) {
  void i18n
    .use(initReactI18next)
    .init({
      compatibilityJSON: 'v4',
      resources: smartSearchResources,
      lng: detectDeviceLanguage(),
      fallbackLng: I18N_FALLBACK_LANGUAGE,
      supportedLngs: ['vi', 'en', 'ja'],
      defaultNS: 'smartSearch',
      interpolation: {
        escapeValue: false,
      },
      returnNull: false,
    });
}

export const syncI18nextLanguage = async (language?: string | null) => {
  const normalized = normalizeSmartSearchLanguage(language);
  if (i18n.language === normalized) return;
  await i18n.changeLanguage(normalized);
};

export default i18n;
