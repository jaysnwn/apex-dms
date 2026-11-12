const { passwordProblem } = await import("./build/password-policy.mjs");
const ok = (c, m) => { if (!c) { console.error("FAIL", m); process.exit(1); } console.log("ok ", m); };
ok(passwordProblem("short1") !== null, "under 10 characters refused");
ok(passwordProblem("onlyletterspass") !== null, "letters only refused");
ok(passwordProblem("12345678901") !== null, "numbers only refused");
ok(passwordProblem("Password123") !== null, "common password refused (any case)");
ok(passwordProblem("ramesh2026xyz", { email: "ramesh@apex.in" }) !== null, "contains the email name: refused");
ok(passwordProblem("Mango-Tree-42") === null, "a reasonable password passes");
