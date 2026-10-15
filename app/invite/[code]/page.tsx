import { Suspense } from "react";
import type { Metadata } from "next";
import { InviteView } from "@/components/live/InviteView";

export const metadata: Metadata = { title: "Convite · Concord" };

export default function InvitePage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-paper" />}>
      <InviteView />
    </Suspense>
  );
}
