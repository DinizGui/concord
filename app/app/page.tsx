import type { Metadata } from "next";
import { LiveApp } from "@/components/live/LiveApp";

export const metadata: Metadata = {
  title: "Concord",
};

export default function AppPage() {
  return <LiveApp />;
}
