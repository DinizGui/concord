import type { Metadata } from "next";
import { ConcordApp } from "@/components/app/ConcordApp";

export const metadata: Metadata = {
  title: "Concord",
};

export default function AppPage() {
  return <ConcordApp />;
}
