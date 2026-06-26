"use client";

/**
 * TRPCReactProvider — wraps the app with TanStack QueryClient and tRPC client.
 *
 * Place this high in the React tree (e.g. src/app/[locale]/layout.tsx or
 * src/app/layout.tsx) so all child components can use `api.*` hooks.
 *
 * @example
 * ```tsx
 * // app/layout.tsx
 * import { TRPCReactProvider } from '@/lib/trpc/provider';
 *
 * export default function RootLayout({ children }: { children: React.ReactNode }) {
 *   return (
 *     <html>
 *       <body>
 *         <TRPCReactProvider>{children}</TRPCReactProvider>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */

import type { ReactNode } from "react";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { api } from "./client";

function getBaseUrl() {
  if (typeof window !== "undefined") return ""; // browser: use relative URL
  if (process.env["VERCEL_URL"]) return `https://${process.env["VERCEL_URL"]}`;
  return `http://localhost:${process.env["PORT"] ?? 3000}`;
}

interface TRPCReactProviderProps {
  children: ReactNode;
}

export function TRPCReactProvider({ children }: TRPCReactProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000, // 30 seconds
            retry: 1,
          },
        },
      })
  );

  const [trpcClient] = useState(() =>
    api.createClient({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
        }),
      ],
    })
  );

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}
