/**
 * Environment variable schema validation using Zod.
 * All environment variables are validated at startup.
 * Import this file instead of `process.env` directly.
 *
 * Usage:
 *   import { env } from "@/env";
 *   const url = env.NEXT_PUBLIC_SUPABASE_URL;
 */
import { z } from "zod";

// ─── Server-side env schema (never exposed to browser) ─────────────────────
const serverSchema = z.object({
  /** Supabase service-role key — server only, never expose to client */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),

  /** Anthropic Claude API key */
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),

  /** Resend API key for transactional email */
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),

  /** Node environment */
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

// ─── Client-side env schema (exposed via NEXT_PUBLIC_ prefix) ──────────────
const clientSchema = z.object({
  /** Supabase project URL */
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),

  /** Supabase anonymous (public) key */
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
});

// ─── Validation logic ───────────────────────────────────────────────────────

/**
 * Safely read raw env vars.
 * In Next.js, NEXT_PUBLIC_ vars are inlined at build time via `process.env`.
 */
function getProcessEnv() {
  return {
    // Server vars
    SUPABASE_SERVICE_ROLE_KEY: process.env["SUPABASE_SERVICE_ROLE_KEY"],
    ANTHROPIC_API_KEY: process.env["ANTHROPIC_API_KEY"],
    RESEND_API_KEY: process.env["RESEND_API_KEY"],
    NODE_ENV: process.env["NODE_ENV"],
    // Client vars (NEXT_PUBLIC_)
    NEXT_PUBLIC_SUPABASE_URL: process.env["NEXT_PUBLIC_SUPABASE_URL"],
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
  };
}

function validateEnv() {
  const rawEnv = getProcessEnv();

  // Validate client env (accessible anywhere)
  const clientResult = clientSchema.safeParse(rawEnv);
  if (!clientResult.success) {
    const errors = clientResult.error.flatten().fieldErrors;
    console.error("❌ Invalid client environment variables:", JSON.stringify(errors, null, 2));
    throw new Error("Invalid client environment variables. Check your .env.local file.");
  }

  // Validate server env (server-side only)
  const isServer = typeof window === "undefined";
  if (isServer) {
    const serverResult = serverSchema.safeParse(rawEnv);
    if (!serverResult.success) {
      const errors = serverResult.error.flatten().fieldErrors;
      console.error("❌ Invalid server environment variables:", JSON.stringify(errors, null, 2));
      throw new Error("Invalid server environment variables. Check your .env.local file.");
    }

    return {
      ...clientResult.data,
      ...serverResult.data,
    } as ClientEnv & ServerEnv;
  }

  // On client: return only client vars; server vars are undefined
  return {
    ...clientResult.data,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
    ANTHROPIC_API_KEY: undefined,
    RESEND_API_KEY: undefined,
    NODE_ENV: (rawEnv.NODE_ENV ?? "development") as "development" | "test" | "production",
  } as ClientEnv & Partial<ServerEnv>;
}

type ClientEnv = z.infer<typeof clientSchema>;
type ServerEnv = z.infer<typeof serverSchema>;

/**
 * Validated environment variables.
 * Server-side vars are `undefined` on the client — access them only in Server Components,
 * Route Handlers, or tRPC procedures.
 */
export const env = validateEnv();
