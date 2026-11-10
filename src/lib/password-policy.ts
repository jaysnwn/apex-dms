// Rules for every new password (people changing their own, admins setting a
// temporary one). Returns the problem in plain words, or null when it is fine.
const COMMON = new Set([
  "password", "password1", "password12", "password123", "1234567890", "12345678910", "qwerty123", "qwertyuiop",
  "iloveyou", "admin12345", "welcome123", "abc1234567", "india12345", "apex123456", "conqrete123", "1q2w3e4r5t",
]);

export const PASSWORD_RULE = "at least 10 characters, with letters and numbers";

export function passwordProblem(pw: string, context: { email?: string | null; name?: string | null } = {}): string | null {
  if (pw.length < 10) return "Password must be at least 10 characters.";
  if (pw.length > 128) return "Password is too long.";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "Password must contain both letters and numbers.";
  const low = pw.toLowerCase();
  if (COMMON.has(low)) return "This password is too common. Choose another.";
  if (/^(.)\1+$/.test(pw)) return "Password cannot be one repeated character.";
  const local = context.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && low.includes(local)) return "Password cannot contain your email name.";
  return null;
}
