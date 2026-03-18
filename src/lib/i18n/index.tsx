"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import de, { type TranslationKey } from "./de";
import en from "./en";

export type Locale = "de" | "en";

const translations: Record<Locale, Record<TranslationKey, string>> = { de, en };

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  formatDate: (date: string | Date) => string;
  formatDateTime: (date: string | Date) => string;
  formatCurrency: (cents: number) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

const LOCALE_STORAGE_KEY = "pool-printer-locale";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("de");

  useEffect(() => {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
    if (stored && (stored === "de" || stored === "en")) {
      setLocaleState(stored);
    }
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
    document.documentElement.lang = newLocale;
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>): string => {
      let text = translations[locale][key] || translations.de[key] || key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return text;
    },
    [locale],
  );

  const formatDate = useCallback(
    (date: string | Date): string => {
      const d = typeof date === "string" ? new Date(date) : date;
      return d.toLocaleDateString(locale === "de" ? "de-DE" : "en-US", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    },
    [locale],
  );

  const formatDateTime = useCallback(
    (date: string | Date): string => {
      const d = typeof date === "string" ? new Date(date) : date;
      return d.toLocaleString(locale === "de" ? "de-DE" : "en-US", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    },
    [locale],
  );

  const formatCurrency = useCallback(
    (cents: number): string => {
      const formatted = new Intl.NumberFormat(
        locale === "de" ? "de-DE" : "en-US",
        {
          style: "currency",
          currency: "EUR",
        },
      ).format(cents / 100);
      return formatted.replace(/[\u00A0\u202F]€/g, "€").replace(/\s+€/g, "€");
    },
    [locale],
  );

  return (
    <I18nContext.Provider
      value={{
        locale,
        setLocale,
        t,
        formatDate,
        formatDateTime,
        formatCurrency,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}

export type { TranslationKey };
