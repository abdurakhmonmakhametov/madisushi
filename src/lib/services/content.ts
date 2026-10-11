import { cache } from "react";
import { db } from "../db";
import type { I18n } from "../pricing";

export type ContentKind = "page" | "news" | "recipe" | "vacancy" | "faq" | "gallery" | "banner" | "legal";

export interface ContentItem {
  id: string;
  kind: ContentKind;
  slug: string;
  title: I18n;
  excerpt: I18n;
  body: I18n;
  image_url: string | null;
  link_url: string | null;
  status: "draft" | "published";
  published_at: string | null;
  sort: number;
}

/** Published content only; drafts never reach the storefront. */
export const listContent = cache(async (kind: ContentKind): Promise<ContentItem[]> => {
  return db.query<ContentItem>(
    "select * from public.content_items where kind = $1 and status = 'published' order by sort, published_at desc nulls last",
    [kind],
  );
});

export const getContent = cache(async (kinds: ContentKind[], slug: string): Promise<ContentItem | null> => {
  return db.one<ContentItem>(
    "select * from public.content_items where kind = any($1) and slug = $2 and status = 'published' limit 1",
    [kinds, slug],
  );
});
