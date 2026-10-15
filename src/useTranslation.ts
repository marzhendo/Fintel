import { useStore } from "./store";
import { locales, LocaleKey } from "./locales";

export function useTranslation() {
  const language = useStore((state) => state.language);
  const t = (key: LocaleKey): string => {
    return locales[language][key] || locales.id[key] || key;
  };
  return { t, language };
}
