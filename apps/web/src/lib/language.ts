import { api } from './api';
import { type Language, setLanguage, useLanguageValue } from './i18n';

/**
 * The language switch: changes the app at once and saves it as the signed-in
 * person's (so it follows them to another device). Not signed in, it is
 * remembered on this device only.
 */
export function useLanguage(): [Language, (language: Language) => void] {
  const language = useLanguageValue();
  const choose = (next: Language) => {
    setLanguage(next);
    api.updateProfile({ language: next }).catch(() => undefined);
  };
  return [language, choose];
}
