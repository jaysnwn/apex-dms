// The database contract the app is checked against (audit finding 2).
// database.types.ts is generated from the migrations; this file adds the one
// thing the generator cannot know: a database function accepts NULL for any
// argument (none of ours is STRICT), and the app passes null on purpose,
// for example "no order id yet" when a new quotation is saved.
import type { Database as Generated } from "./database.types";

type NullableArgs<A> = A extends unknown ? { [K in keyof A]: A[K] | null } : never;
type WithNullableArgs<F> = F extends { Args: infer A } ? Omit<F, "Args"> & { Args: NullableArgs<A> } : F;
type Functions = { [K in keyof Generated["public"]["Functions"]]: WithNullableArgs<Generated["public"]["Functions"][K]> };

// tenant_id (the business a row belongs to) is filled in by the database for
// every new row (stamp trigger, migration 0020): the app never sends it.
type StampedInsert<T> = T extends { Insert: infer I }
  ? Omit<T, "Insert"> & { Insert: I extends { tenant_id: unknown } ? Omit<I, "tenant_id"> & { tenant_id?: string } : I }
  : T;

// Columns a BEFORE INSERT trigger fills in, which the generator reads as
// required because the column is NOT NULL and has no column default. Sending
// them is allowed; leaving them out is correct. Each entry names the trigger
// that supplies the value, so the claim can be checked against the database.
//   stock_movements.brand_id   stock_movement_before_insert: taken from the
//                              product, and the warehouse must match it
//   stock_movements.unit_cost  the same trigger: the product's purchase cost,
//                              when the row adds stock and names no cost
//   products.search_text       products_search_text trigger (migration 0026):
//                              everything the search box matches, in one
//                              column. retailers.search_text is a generated
//                              column, which the generator already reads as
//                              optional, so it is not listed here.
//   invoices.search_text       invoices_search_text trigger, the same idea
//   suppliers.code             suppliers_normalise trigger: the next free
//                              SUP-0001, SUP-0002, ... when none is given
type TriggerFilled = {
  stock_movements: "brand_id" | "unit_cost";
  products: "search_text";
  invoices: "search_text";
  suppliers: "code";
};
type Optionalize<I, C extends PropertyKey> = Omit<I, C> & { [K in Extract<keyof I, C>]?: I[K] };
type FilledInsert<K extends string, T> = K extends keyof TriggerFilled
  ? T extends { Insert: infer I } ? Omit<T, "Insert"> & { Insert: Optionalize<I, TriggerFilled[K]> } : T
  : T;
type Tables_ = { [K in keyof Generated["public"]["Tables"]]: FilledInsert<K & string, StampedInsert<Generated["public"]["Tables"][K]>> };

// A view's columns are left exactly as generated, which means nullable. The
// generator cannot do better: Postgres does not record whether a view column
// can be null, so every one is reported that way. Declaring them non-null was
// tried and dropped: several of these views are built on LEFT JOINs
// (retailer_directory.route_name and .salesman_name are null for a retailer
// with no route or no salesman), and in a system that adds up money a null
// must never arrive typed as a value.
export type Database = Omit<Generated, "public"> & {
  public: Omit<Generated["public"], "Functions" | "Tables"> & { Functions: Functions; Tables: Tables_ };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type Insert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];
export type Update<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"];
export type Views<T extends keyof Database["public"]["Views"]> = Database["public"]["Views"][T]["Row"];
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];
export type { Json } from "./database.types";
