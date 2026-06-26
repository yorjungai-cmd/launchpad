/**
 * Public route group layout.
 *
 * Wraps public pages (/submit, /track) with the same AppLayout (Navbar)
 * as authenticated pages — so logged-in users see navigation and can
 * navigate back without losing context.
 *
 * Auth is NOT required — middleware allows these routes for everyone.
 * TRPCReactProvider is included so public tRPC procedures work (idea.submit etc.)
 */
import type { ReactNode } from "react";
import { AppLayout } from "@/components/shared";
import { TRPCReactProvider } from "@/lib/trpc/provider";

interface PublicGroupLayoutProps {
  children: ReactNode;
}

export default function PublicGroupLayout({ children }: PublicGroupLayoutProps) {
  return (
    <TRPCReactProvider>
      <AppLayout>{children}</AppLayout>
    </TRPCReactProvider>
  );
}
