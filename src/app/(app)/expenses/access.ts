// Who sees what in Expenses. Managers approve; the office (managers + billing) pays
// employees back and sees everyone's expenses; everyone else sees only their own.
export function expenseAccess(role: string) {
  const mgr = role === "super_admin" || role === "manager";
  const office = mgr || role === "billing";
  return { mgr, office };
}

export const ALL_TIME_FROM = "2020-01-01";
