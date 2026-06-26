/**
 * TypeScript seed helper for local development.
 *
 * Seeds test users with different roles into the local Supabase instance.
 * Requires a running local Supabase stack (pnpm supabase:start).
 *
 * Usage:
 *   pnpm supabase:seed
 *   # or directly:
 *   tsx scripts/seed.ts
 *
 * NOTE: This uses the service-role key to bypass RLS and insert seed data.
 *       Never run against production.
 */

import { createClient } from "@supabase/supabase-js";

// ─── Config ───────────────────────────────────────────────────────────────────
// Default to local Supabase dev URLs — override via env vars
const SUPABASE_URL = process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
  // Local dev default service-role key (safe to use locally only)
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hj04zWl196z2-SBc0";

if (SUPABASE_URL.includes("supabase.co")) {
  console.error("❌ Refusing to seed against a cloud Supabase instance. Use local dev only.");
  process.exit(1);
}

// ─── Seed data ────────────────────────────────────────────────────────────────
type AppRole = "guest" | "internal_submitter" | "bd_reviewer" | "admin";

interface SeedUser {
  id: string;
  email: string;
  password: string;
  full_name: string;
  role: AppRole;
  locale: string;
}

const SEED_USERS: SeedUser[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    email: "admin@applcad.test",
    password: "password123",
    full_name: "Admin User",
    role: "admin",
    locale: "th",
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    email: "reviewer@applcad.test",
    password: "password123",
    full_name: "BD Reviewer",
    role: "bd_reviewer",
    locale: "th",
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    email: "employee@applcad.test",
    password: "password123",
    full_name: "Internal Employee",
    role: "internal_submitter",
    locale: "th",
  },
  {
    id: "00000000-0000-0000-0000-000000000004",
    email: "employee.en@applcad.test",
    password: "password123",
    full_name: "English User",
    role: "internal_submitter",
    locale: "en",
  },
];

// ─── Seed function ────────────────────────────────────────────────────────────
async function seed() {
  console.log("🌱 Starting seed...");
  console.log(`   Supabase URL: ${SUPABASE_URL}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  let successCount = 0;
  let errorCount = 0;

  for (const user of SEED_USERS) {
    try {
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
        user_metadata: {
          full_name: user.full_name,
          role: user.role,
          locale: user.locale,
        },
      });

      if (authError && !authError.message.includes("already been registered")) {
        throw authError;
      }

      const userId = authData?.user?.id ?? user.id;

      // Upsert profile
      const { error: profileError } = await supabase.from("profiles").upsert(
        {
          id: userId,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          locale: user.locale,
        },
        { onConflict: "id" }
      );

      if (profileError) throw profileError;

      console.log(`   ✅ ${user.email} (${user.role})`);
      successCount++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`   ❌ ${user.email}: ${message}`);
      errorCount++;
    }
  }

  console.log(`\n🌱 Seed complete: ${successCount} succeeded, ${errorCount} failed`);

  if (errorCount > 0) {
    process.exit(1);
  }
}

seed().catch((err) => {
  console.error("Fatal seed error:", err);
  process.exit(1);
});
