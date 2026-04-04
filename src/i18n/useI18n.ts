import { useCallback } from 'react';

import { useLanguageStore } from '@/src/store/useLanguageStore';

import { translate } from './translations';

type TranslateParams = Record<string, string | number>;

export const useI18n = () => {
  const language = useLanguageStore((s) => s.language);

  const t = useCallback(
    (key: string, params?: TranslateParams) => translate(language, key, params),
    [language]
  );

  return {
    language,
    t,
  };
};
