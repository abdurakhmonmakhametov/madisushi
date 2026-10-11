// All money is integer UZS (so'm). These helpers never use floating point
// for amounts that are stored or charged.

/** 125600 -> "125 600 UZS" (no-break spaces between groups). */
export function formatUZS(amount: number): string {
  if (!Number.isInteger(amount)) throw new Error(`money must be an integer, got ${amount}`);
  const sign = amount < 0 ? "−" : "";
  const digits = String(Math.abs(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${digits} UZS`;
}

/** floor(amount * bps / 10000) using integer arithmetic. */
export function applyBps(amount: number, bps: number): number {
  if (!Number.isInteger(amount) || !Number.isInteger(bps)) throw new Error("applyBps requires integers");
  return Math.floor((amount * bps) / 10000);
}

/** floor(amount * percent / 100) using integer arithmetic. */
export function percentOf(amount: number, percent: number): number {
  if (!Number.isInteger(amount) || !Number.isInteger(percent)) throw new Error("percentOf requires integers");
  return Math.floor((amount * percent) / 100);
}

/** Parses user input like "20 000" or "20000" into an integer, or null. */
export function parseAmount(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined || input === "") return null;
  const s = String(input).replace(/[\s ,]/g, "");
  if (!/^-?\d{1,12}$/.test(s)) return null;
  return Number(s);
}
