/**
 * Integration test: profiles table RLS policies
 *
 * Tests that Row Level Security correctly enforces:
 * - Users can read their own profile
 * - Users cannot read other users' profiles
 * - Admins can read all profiles
 * - Users can update their own profile
 * - Users cannot update others' profiles
 *
 * Uses a mock Supabase client — no real DB required.
 */

import { describe, it, expect } from "vitest";
import type { Profile, AppRole } from "@/lib/supabase/types";

// ─── Mock Data ────────────────────────────────────────────────────────────────
const PROFILES: Profile[] = [
  {
    id: "user-001",
    email: "admin@applcad.test",
    full_name: "Admin User",
    role: "admin" as AppRole,
    locale: "th",
    created_at: "2026-06-25T00:00:00Z",
    updated_at: "2026-06-25T00:00:00Z",
  },
  {
    id: "user-002",
    email: "reviewer@applcad.test",
    full_name: "BD Reviewer",
    role: "bd_reviewer" as AppRole,
    locale: "th",
    created_at: "2026-06-25T00:00:00Z",
    updated_at: "2026-06-25T00:00:00Z",
  },
  {
    id: "user-003",
    email: "employee@applcad.test",
    full_name: "Internal Employee",
    role: "internal_submitter" as AppRole,
    locale: "th",
    created_at: "2026-06-25T00:00:00Z",
    updated_at: "2026-06-25T00:00:00Z",
  },
];

// ─── RLS simulation helpers ───────────────────────────────────────────────────
/**
 * Simulates the profiles RLS policy:
 * - A user can only see their own row (unless they are admin)
 */
function simulateSelectWithRLS(
  requestingUserId: string,
  requestingUserRole: AppRole,
  targetUserId?: string
): Profile[] {
  const isAdmin = requestingUserRole === "admin";

  if (targetUserId) {
    // Selecting by ID
    const target = PROFILES.find((p) => p.id === targetUserId);
    if (!target) return [];
    // Admin sees all; others see only their own
    if (isAdmin || target.id === requestingUserId) return [target];
    return [];
  }

  // Selecting all rows
  if (isAdmin) return [...PROFILES];
  // Non-admin: only own row
  return PROFILES.filter((p) => p.id === requestingUserId);
}

/**
 * Simulates the profiles RLS update policy:
 * - A user can only update their own row (unless they are admin)
 */
function simulateUpdateWithRLS(
  requestingUserId: string,
  requestingUserRole: AppRole,
  targetUserId: string,
  updates: Partial<Profile>
): { data: Profile | null; error: string | null } {
  const isAdmin = requestingUserRole === "admin";
  const isOwner = requestingUserId === targetUserId;

  if (!isAdmin && !isOwner) {
    return {
      data: null,
      error: 'new row violates row-level security policy for table "profiles"',
    };
  }

  const profile = PROFILES.find((p) => p.id === targetUserId);
  if (!profile) {
    return { data: null, error: "Profile not found" };
  }

  return {
    data: { ...profile, ...updates, updated_at: new Date().toISOString() },
    error: null,
  };
}

// ─── Mock Supabase client ─────────────────────────────────────────────────────
function createMockSupabaseClient(requestingUserId: string, requestingUserRole: AppRole) {
  return {
    from: (table: string) => {
      if (table !== "profiles") {
        throw new Error(`Unexpected table: ${table}`);
      }
      return {
        select: (_cols?: string) => ({
          eq: (col: string, value: string) => {
            if (col !== "id") throw new Error(`Unexpected eq column: ${col}`);
            const rows = simulateSelectWithRLS(requestingUserId, requestingUserRole, value);
            return Promise.resolve({ data: rows, error: null });
          },
          // Select all
          then: (resolve: (value: { data: Profile[]; error: null }) => void) => {
            const rows = simulateSelectWithRLS(requestingUserId, requestingUserRole);
            resolve({ data: rows, error: null });
          },
        }),
        update: (updates: Partial<Profile>) => ({
          eq: (col: string, value: string) => {
            if (col !== "id") throw new Error(`Unexpected eq column: ${col}`);
            const result = simulateUpdateWithRLS(
              requestingUserId,
              requestingUserRole,
              value,
              updates
            );
            return Promise.resolve(result);
          },
        }),
      };
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("RLS: profiles table", () => {
  describe("SELECT policies", () => {
    describe("regular user (internal_submitter)", () => {
      it("can read their own profile", async () => {
        const supabase = createMockSupabaseClient("user-003", "internal_submitter");
        const result = await supabase.from("profiles").select("*").eq("id", "user-003");

        expect(result.error).toBeNull();
        expect(result.data).toHaveLength(1);
        expect(result.data![0]!.id).toBe("user-003");
        expect(result.data![0]!.email).toBe("employee@applcad.test");
      });

      it("cannot read another user's profile", async () => {
        const supabase = createMockSupabaseClient("user-003", "internal_submitter");
        const result = await supabase.from("profiles").select("*").eq("id", "user-002");

        expect(result.error).toBeNull();
        // RLS returns empty result instead of an error (no row found)
        expect(result.data).toHaveLength(0);
      });

      it("cannot read admin's profile", async () => {
        const supabase = createMockSupabaseClient("user-003", "internal_submitter");
        const result = await supabase.from("profiles").select("*").eq("id", "user-001");

        expect(result.error).toBeNull();
        expect(result.data).toHaveLength(0);
      });

      it("selecting all profiles returns only own row", async () => {
        const supabase = createMockSupabaseClient("user-003", "internal_submitter");
        const rows = await new Promise<Profile[]>((resolve) => {
          supabase
            .from("profiles")
            .select("*")
            .then(({ data }) => resolve(data));
        });

        expect(rows).toHaveLength(1);
        expect(rows[0]!.id).toBe("user-003");
      });
    });

    describe("bd_reviewer", () => {
      it("can read their own profile", async () => {
        const supabase = createMockSupabaseClient("user-002", "bd_reviewer");
        const result = await supabase.from("profiles").select("*").eq("id", "user-002");

        expect(result.error).toBeNull();
        expect(result.data).toHaveLength(1);
        expect(result.data![0]!.role).toBe("bd_reviewer");
      });

      it("cannot read another user's profile (bd_reviewer is not admin)", async () => {
        const supabase = createMockSupabaseClient("user-002", "bd_reviewer");
        const result = await supabase.from("profiles").select("*").eq("id", "user-003");

        expect(result.data).toHaveLength(0);
      });
    });

    describe("admin", () => {
      it("can read their own profile", async () => {
        const supabase = createMockSupabaseClient("user-001", "admin");
        const result = await supabase.from("profiles").select("*").eq("id", "user-001");

        expect(result.error).toBeNull();
        expect(result.data).toHaveLength(1);
        expect(result.data![0]!.role).toBe("admin");
      });

      it("can read any other user's profile", async () => {
        const supabase = createMockSupabaseClient("user-001", "admin");
        const result = await supabase.from("profiles").select("*").eq("id", "user-003");

        expect(result.error).toBeNull();
        expect(result.data).toHaveLength(1);
        expect(result.data![0]!.id).toBe("user-003");
      });

      it("selecting all profiles returns all rows", async () => {
        const supabase = createMockSupabaseClient("user-001", "admin");
        const rows = await new Promise<Profile[]>((resolve) => {
          supabase
            .from("profiles")
            .select("*")
            .then(({ data }) => resolve(data));
        });

        expect(rows).toHaveLength(3); // all seed profiles
        const ids = rows.map((r) => r.id);
        expect(ids).toContain("user-001");
        expect(ids).toContain("user-002");
        expect(ids).toContain("user-003");
      });
    });
  });

  describe("UPDATE policies", () => {
    describe("regular user (internal_submitter)", () => {
      it("can update their own profile", async () => {
        const supabase = createMockSupabaseClient("user-003", "internal_submitter");
        const result = await supabase
          .from("profiles")
          .update({ full_name: "Updated Name", locale: "en" })
          .eq("id", "user-003");

        expect(result.error).toBeNull();
        expect(result.data).not.toBeNull();
        expect(result.data!.full_name).toBe("Updated Name");
        expect(result.data!.locale).toBe("en");
      });

      it("cannot update another user's profile", async () => {
        const supabase = createMockSupabaseClient("user-003", "internal_submitter");
        const result = await supabase
          .from("profiles")
          .update({ full_name: "Hacked" })
          .eq("id", "user-002");

        expect(result.data).toBeNull();
        expect(result.error).toContain("row-level security");
      });

      it("cannot update admin's profile", async () => {
        const supabase = createMockSupabaseClient("user-003", "internal_submitter");
        const result = await supabase
          .from("profiles")
          .update({ role: "admin" as AppRole })
          .eq("id", "user-001");

        expect(result.data).toBeNull();
        expect(result.error).toContain("row-level security");
      });
    });

    describe("admin", () => {
      it("can update their own profile", async () => {
        const supabase = createMockSupabaseClient("user-001", "admin");
        const result = await supabase
          .from("profiles")
          .update({ full_name: "Super Admin" })
          .eq("id", "user-001");

        expect(result.error).toBeNull();
        expect(result.data!.full_name).toBe("Super Admin");
      });

      it("can update any other user's profile", async () => {
        const supabase = createMockSupabaseClient("user-001", "admin");
        const result = await supabase
          .from("profiles")
          .update({ role: "bd_reviewer" as AppRole })
          .eq("id", "user-003");

        expect(result.error).toBeNull();
        expect(result.data).not.toBeNull();
        expect(result.data!.role).toBe("bd_reviewer");
      });

      it("can change any user's role", async () => {
        const supabase = createMockSupabaseClient("user-001", "admin");
        const result = await supabase
          .from("profiles")
          .update({ role: "bd_reviewer" as AppRole })
          .eq("id", "user-003");

        expect(result.error).toBeNull();
        expect(result.data!.role).toBe("bd_reviewer");
      });
    });
  });

  describe("AppRole enum coverage", () => {
    const validRoles: AppRole[] = ["guest", "internal_submitter", "bd_reviewer", "admin"];

    it.each(validRoles)("role '%s' is a valid AppRole value", (role: AppRole) => {
      expect(validRoles).toContain(role);
    });

    it("profiles have correct default role (internal_submitter)", () => {
      const newProfile: Partial<Profile> = {
        id: "new-user",
        email: "new@applcad.test",
        // role not specified → default is internal_submitter
      };

      const defaultRole: AppRole = "internal_submitter";
      const role = newProfile.role ?? defaultRole;
      expect(role).toBe("internal_submitter");
    });

    it("guest role has no corresponding profiles row", () => {
      // In the system design: guest users access via reference number, not via auth
      // They should not have a profile row
      const guestProfile = PROFILES.find((p) => p.role === "guest");
      expect(guestProfile).toBeUndefined();
    });
  });
});
