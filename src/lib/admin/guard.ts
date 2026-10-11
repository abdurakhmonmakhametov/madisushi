// Staff authorization for /admin. Every admin page and server action calls
// requireStaff(); database RLS policies enforce the same rules underneath.
import { redirect } from "next/navigation";
import { getStaff, type Staff } from "../auth/session";
import type { StaffRole } from "../order-status";

export type Permission =
  | "dashboard"
  | "orders"
  | "availability"
  | "menu"
  | "brands"
  | "branches"
  | "reservations"
  | "customers"
  | "promotions"
  | "content"
  | "settings"
  | "staff"
  | "audit"
  | "feedback";

const MATRIX: Record<StaffRole, Permission[]> = {
  super_admin: ["dashboard", "orders", "availability", "menu", "brands", "branches", "reservations", "customers", "promotions", "content", "settings", "staff", "audit", "feedback"],
  branch_manager: ["dashboard", "orders", "availability", "branches", "reservations", "customers", "audit", "feedback"],
  kitchen: ["orders", "availability"],
};

export function can(role: StaffRole, p: Permission): boolean {
  return MATRIX[role].includes(p);
}

export function permissionsOf(role: StaffRole): Permission[] {
  return MATRIX[role];
}

export class ForbiddenError extends Error {}

/** For pages: redirects to login, or to the staff home when not permitted. */
export async function requireStaff(p?: Permission): Promise<Staff> {
  const staff = await getStaff();
  if (!staff) redirect("/admin/login");
  if (p && !can(staff.role, p)) redirect(staff.role === "kitchen" ? "/admin/orders" : "/admin");
  return staff;
}

/** For server actions: throws instead of redirecting. */
export async function assertStaff(p: Permission): Promise<Staff> {
  const staff = await getStaff();
  if (!staff || !can(staff.role, p)) throw new ForbiddenError("forbidden");
  return staff;
}

/** Branch filter a staff member may use (super admin: any). */
export function allowedBranch(staff: Staff, branchId: string | undefined | null): string | undefined {
  if (!branchId) return undefined;
  if (staff.role === "super_admin" || staff.branchIds.includes(branchId)) return branchId;
  return undefined;
}
