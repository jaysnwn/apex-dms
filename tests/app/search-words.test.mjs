const { searchWords } = await import("./build/search-words.mjs");
const ok = (c, m) => { if (!c) { console.error("FAIL", m); process.exit(1); } console.log("ok ", m); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
ok(eq(searchWords("Type-C 65W"), ["type-c", "65w"]), "words lower-cased, hyphen kept (SKUs like CQ-012345)");
ok(eq(searchWords("type c"), ["type"]), "one-letter words dropped when longer ones exist");
ok(eq(searchWords("c"), ["c"]), "but kept when they are all there is");
ok(eq(searchWords("  a,b(c)*%_\\  "), ["a", "b", "c"]), "pattern characters removed");
ok(searchWords("one two three four five six seven").length === 5, "at most 5 words");
ok(eq(searchWords(""), []) && eq(searchWords(undefined), []), "empty search: no words");
