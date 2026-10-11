import { cookies } from "next/headers";
import { cache } from "react";
import { DEFAULT_LANG, isLang, translate, type DictKey, type Lang } from "./dict";

export const LANG_COOKIE = "lang";

export const getLang = cache(async (): Promise<Lang> => {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(v) ? v : DEFAULT_LANG;
});

export async function getT() {
  const lang = await getLang();
  return { lang, t: (key: DictKey, vars?: Record<string, string | number>) => translate(lang, key, vars) };
}
