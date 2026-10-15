import type { Metadata } from "next";
import { ForgotFlow } from "@/components/auth/AccountFlows";

export const metadata: Metadata = { title: "Esqueci a senha · Concord" };

export default function Page() {
  return <ForgotFlow />;
}
