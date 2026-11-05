import { Tabs } from "@/components/tabs";

export function RouteTabs() {
  return (
    <Tabs
      items={[
        { href: "/routes", label: "Today's progress", exact: true },
        { href: "/routes/plan", label: "Plan routes" },
        { href: "/routes/targets", label: "Targets" },
        { href: "/retailers/routes", label: "Route list" },
        { href: "/routes/today", label: "My route (field app)" },
      ]}
    />
  );
}
