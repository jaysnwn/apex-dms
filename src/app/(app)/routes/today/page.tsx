import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { FieldApp } from "./field-app";
import { fieldToday, type FieldDay } from "../actions";

export const metadata: Metadata = { title: "Today's route" };

export default async function TodayPage() {
  await requireRole("salesman", "manager", "super_admin");
  let day: FieldDay | null = null;
  try {
    day = await fieldToday();
  } catch {
    day = null; // the phone falls back to its cached copy
  }
  return <FieldApp initial={day} />;
}
