import { Tabs } from "@/components/tabs";

export function RouteTabs() {
  return (
    <Tabs
      items={[
        { href: "/routes", label: "Live progress", exact: true },
        { href: "/routes/manage", label: "Routes" },
        { href: "/routes/assignments", label: "Salesmen & routes" },
        { href: "/routes/plan", label: "Visit schedule" },
        { href: "/routes/places", label: "Towns & territories" },
        { href: "/routes/targets", label: "Targets" },
        { href: "/routes/incentives", label: "Incentives" },
      ]}
    />
  );
}
