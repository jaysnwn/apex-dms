// Narrowing a value that came from outside the app (a URL query string, a form
// field) to a database enum, before it reaches a filter (audit finding 2).
//
// Until now these values went straight into .eq("status", sp.status). A value
// the enum does not have reached Postgres, which refused it, and the page broke
// with a database error instead of ignoring an unusable filter. The allowed
// values come from Constants in database.types.ts, generated from the
// migrations, so adding a value to an enum in SQL is enough: nothing here has
// to be edited to keep the two in step.
import { Constants } from "./supabase/database.types";
import type { Enums } from "./supabase/database";

type EnumName = keyof typeof Constants.public.Enums;

// The value if the enum has it, otherwise undefined ("no filter").
export function enumParam<N extends EnumName>(name: N, value: unknown): Enums<N> | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  const allowed = Constants.public.Enums[name] as readonly string[];
  return allowed.includes(value) ? (value as Enums<N>) : undefined;
}

// Every value the enum has, for building filter dropdowns from one source.
export function enumValues<N extends EnumName>(name: N): readonly Enums<N>[] {
  // Indexing with a generic name widens to the union of every enum tuple, so
  // the step through unknown is needed; the return type is the correct one.
  return Constants.public.Enums[name] as unknown as readonly Enums<N>[];
}
