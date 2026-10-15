import type { Metadata } from "next";
import { VerifyFlow } from "@/components/auth/AccountFlows";

export const metadata: Metadata = { title: "Confirmar e-mail · Concord" };

export default function Page() {
  return <VerifyFlow />;
}
