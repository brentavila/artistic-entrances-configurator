import { Suspense } from "react";
import { PlannerApp } from "@/components/planner/PlannerApp";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Preview Your Entry",
  description:
    "Walk through a 3D preview of an Artistic Entrances door sized to your rough opening, wall thickness, and swing.",
  path: "/planner",
});

export default function PlannerPage() {
  return (
    <main className="planner-page">
      <Suspense fallback={<p className="planner-loading">Loading the planner…</p>}>
        <PlannerApp />
      </Suspense>
    </main>
  );
}
