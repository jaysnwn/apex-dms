import { redirect } from "next/navigation";

// Routes are managed in Routes → Routes (towns, outlets, salesman, schedule).
export default function OldRoutesPage() {
  redirect("/routes/manage");
}
