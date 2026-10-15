import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = { title: "Criar conta · Concord" };

export default function Page() {
  return <AuthForm mode="register" />;
}
