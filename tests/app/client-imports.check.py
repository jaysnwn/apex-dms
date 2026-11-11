"""Server code must not import plain values (lists, constants, helpers) from a
"use client" file: on the server those are only placeholders, so code like
LIST.filter(...) crashes the page (found on /stock/entry and the dashboard).
Components may be imported; types are fine. Exit 1 on any violation."""
import os, pathlib, re, sys

root = pathlib.Path(__file__).resolve().parents[2]
src = root / "src"
files = [p for p in src.rglob("*") if p.suffix in (".ts", ".tsx")]
is_client = {p: re.match(r'\s*["\']use client["\']', p.read_text()) is not None for p in files}
plain = {}
for p in files:
    if is_client[p]:
        for m in re.finditer(r'export\s+(?:const|let|function|async function)\s+([A-Za-z_]\w*)', p.read_text()):
            if not re.match(r'^[A-Z][a-z]', m.group(1)):
                plain.setdefault(p, set()).add(m.group(1))

def resolve(frm, spec):
    base = src / spec[2:] if spec.startswith("@/") else (frm.parent / spec if spec.startswith(".") else None)
    if base is None: return None
    for ext in (".ts", ".tsx", "/index.ts", "/index.tsx"):
        q = pathlib.Path(os.path.normpath(str(base) + ext))
        if q.exists(): return q

bad = []
for p in files:
    if is_client[p]: continue
    for m in re.finditer(r'import\s+(?!type\b)\{([^}]*)\}\s+from\s+["\']([^"\']+)["\']', p.read_text()):
        t = resolve(p, m.group(2))
        if t in plain:
            names = {n.strip().split(" as ")[0] for n in m.group(1).split(",") if n.strip() and not n.strip().startswith("type ")}
            if names & plain[t]:
                bad.append(f"{p.relative_to(root)} imports {sorted(names & plain[t])} from client file {t.relative_to(root)}")
print("\n".join(bad) if bad else "ok  no server file imports plain values from a client file")
sys.exit(1 if bad else 0)
