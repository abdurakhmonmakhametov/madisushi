// Client-safe: the restaurant menu is the home page.
/** Storefront URL of the menu, optionally for a branch or opening a product. */
export function menuHref(q: { branch?: string | null; p?: string | null } = {}) {
  const params = new URLSearchParams();
  if (q.branch) params.set("branch", q.branch);
  if (q.p) params.set("p", q.p);
  const s = params.toString();
  return s ? `/?${s}` : "/";
}
