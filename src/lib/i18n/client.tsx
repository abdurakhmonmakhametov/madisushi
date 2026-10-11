"use client";

import { createContext, useCallback, useContext } from "react";
import { translate, tr, type DictKey, type I18nText, type Lang } from "./dict";

const LangContext = createContext<Lang>("uz");

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang(): Lang {
  return useContext(LangContext);
}

export function useT() {
  const lang = useLang();
  const t = useCallback((key: DictKey, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);
  const pick = useCallback((v: I18nText) => tr(v, lang), [lang]);
  return { lang, t, tr: pick };
}
