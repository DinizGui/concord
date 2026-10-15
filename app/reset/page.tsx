import type { Metadata } from "next";
import { ResetFlow } from "@/components/auth/AccountFlows";

export const metadata: Metadata = { title: "Nova senha · Concord" };

export default function Page() {
  return <ResetFlow />;
}
