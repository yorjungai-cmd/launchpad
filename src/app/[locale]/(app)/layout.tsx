/**
 * Authenticated app group layout.
 *
 * Wraps all authenticated pages in `(app)/**` with:
 *   - AppLayout (Navbar + main wrapper)
 *   - TRPCReactProvider (TanStack Query + tRPC client)
 *
 * Route protection (auth) is handled by middleware.ts.
 * Role-based page protection is enforced per-page via server-side role checks.
 */
import type { ReactNode } from "react";
import { AppLayout } from "@/components/shared";
import { TRPCReactProvider } from "@/lib/trpc/provider";

interface AppGroupLayoutProps {
  children: ReactNode;
}

export default function AppGroupLayout({ children }: AppGroupLayoutProps) {
  return (
    <TRPCReactProvider>
      <AppLayout>{children}</AppLayout>
    </TRPCReactProvider>
  );
}
