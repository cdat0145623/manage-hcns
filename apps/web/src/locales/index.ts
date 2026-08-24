export const locales = [
  "vi",
  "en",
] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "vi";

export const localeNames: Record<Locale, string> = {
  vi: "Tiếng Việt",
  en: "English",
};

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export function resolveInitialLocale(savedLocale: string | null): Locale {
  return savedLocale && isLocale(savedLocale) ? savedLocale : defaultLocale;
}
