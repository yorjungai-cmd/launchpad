/**
 * tRPC React client.
 *
 * Import `api` anywhere in client components to call tRPC procedures
 * with full type safety and TanStack Query integration.
 *
 * @example
 * ```tsx
 * import { api } from '@/lib/trpc/client';
 *
 * function HealthBadge() {
 *   const { data } = api.health.check.useQuery();
 *   return <span>{data?.status}</span>;
 * }
 * ```
 */

import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@/server/root";

/**
 * Typed tRPC React client.
 * Must be wrapped in `<TRPCReactProvider>` (see src/lib/trpc/provider.tsx).
 */
export const api = createTRPCReact<AppRouter>();
