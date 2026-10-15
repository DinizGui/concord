import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = { title: "Entrar · Concord" };

export default function Page() {
  return <AuthForm mode="login" />;
}
