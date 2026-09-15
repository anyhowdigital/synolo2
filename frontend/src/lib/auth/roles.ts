/** Ρόλοι και δικαιώματα – ασφαλές για import από client components. */
export type Role = "owner" | "admin" | "member" | "accountant";

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Ιδιοκτήτης",
  admin: "Διαχειριστής",
  member: "Χρήστης",
  accountant: "Λογιστής",
};

/** Δικαιώματα ανά ρόλο. */
export const PERMISSIONS = {
  manageBilling: ["owner"],
  manageSettings: ["owner", "admin"],
  manageUsers: ["owner", "admin"],
  write: ["owner", "admin", "member"],
  read: ["owner", "admin", "member", "accountant"],
} as const satisfies Record<string, readonly Role[]>;

export function can(role: string | null | undefined, permission: keyof typeof PERMISSIONS) {
  return !!role && (PERMISSIONS[permission] as readonly string[]).includes(role);
}
