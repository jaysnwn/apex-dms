import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { FieldApp } from "../../(app)/routes/today/field-app";
import { fieldToday, type FieldDay } from "../../(app)/routes/actions";

export const metadata: Metadata = { title: "Today's route" };

export default async function FieldRoutePage() {
  await requireRole("salesman", "manager", "super_admin");
  let day: FieldDay | null = null;
  try {
    day = await fieldToday();
  } catch {
    day = null; // the phone falls back to its cached copy
  }
  return <FieldApp initial={day} mobile />;
}
