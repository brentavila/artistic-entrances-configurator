import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PlannerApp } from "@/components/planner/PlannerApp";

export const metadata: Metadata = {
  title: "Preview Your Entry | Artistic Entrances",
  description:
    "Walk through a 3D preview of an Artistic Entrances door sized to your rough opening, wall thickness, and swing.",
};

export default function PlannerPage() {
  return (
    <main className="planner-page">
      <header className="site-header planner-header">
        <Link className="brand" href="/" aria-label="Artistic Entrances home">
          <span>AE</span>
          <div>
            <strong>Artistic Entrances</strong>
            <small>Custom Iron Doors</small>
          </div>
        </Link>
        <Link className="header-cta" href="/#configurator">
          Design Your Door
        </Link>
      </header>
      <Suspense fallback={<p className="planner-loading">Loading the planner…</p>}>
        <PlannerApp />
      </Suspense>
    </main>
  );
}
