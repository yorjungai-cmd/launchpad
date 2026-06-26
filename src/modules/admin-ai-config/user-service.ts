/**
 * UserManagementService — User CRUD via Supabase Auth Admin API.
 *
 * Responsibilities:
 *   - listUsers()          — Auth Admin listUsers + batch-fetch profiles → UserRow[]
 *   - createUser()         — createUser (email_confirm:true) + upsert profile + audit log
 *   - updateUserRole()     — guard self-demotion + update profiles.role
 *                            + Auth Admin updateUserById user_metadata + audit log
 *   - deleteUser()         — guard self-delete + delete profile (cascade)
 *                            + Auth Admin deleteUser + audit log
 *
 * Guard decisions:
 *   1. Self-delete   — always forbidden; `AppError.forbidden` thrown before any DB work.
 *   2. Self-demotion — if `adminId === userId` and `role !== 'admin'`, ensure at least one
 *                      OTHER active admin exists; if not, `AppError.forbidden` is thrown.
 *                      This prevents accidental lock-out of all admin accounts.
 *
 * Security:
 *   - All Auth Admin calls use `createAdminSupabaseClient()` (service-role key).
 *   - Never exposes passwords or auth tokens outside this service.
 *   - Audit log metadata never contains forbidden fields.
 *
 * Design refs:
 *   - design/components.md  — UserManagementService (Component 2)
 *   - design/integration.md — Supabase Auth Admin API
 *   - design/data-model.md  — profiles table
 *
 * Task 6.1
 */

import logger from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { adminAuditLogService } from "./audit-log-service";
import type { UserRow, CreateUserInput, AppRole } from "./schemas";

// ─── Internal types ───────────────────────────────────────────────────────────

/** Minimal shape we need from each Auth user record. */
interface AuthUser {
  id: string;
  email?: string;
  created_at: string;
  last_sign_in_at?: string | null;
  user_metadata?: {
    full_name?: string;
    role?: string;
  };
}

/** Shape returned by the profiles table SELECT. */
interface ProfileRow {
  id: string;
  full_name: string | null;
  role: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class UserManagementService {
  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * listUsers — fetch all Auth users and merge with profiles to get roles.
   *
   * Strategy:
   *   1. `auth.admin.listUsers()` — primary source for email, created_at, last_sign_in_at.
   *   2. Batch-fetch all rows from `profiles` — source of truth for `role` and `full_name`.
   *   3. Merge by `id`; use profile.role when present, fall back to user_metadata.role.
   *
   * @returns Sorted array of UserRow (newest first by createdAt).
   */
  async listUsers(): Promise<UserRow[]> {
    const db = createAdminSupabaseClient();

    // ── 1. Fetch all Auth users ────────────────────────────────────────────
    const { data: authData, error: authErr } = await db.auth.admin.listUsers({ perPage: 1000 });

    if (authErr) {
      logger.error(
        { err: authErr },
        "UserManagementService.listUsers: auth.admin.listUsers failed"
      );
      throw AppError.internal("Failed to list users");
    }

    const authUsers = authData.users as AuthUser[];

    if (authUsers.length === 0) {
      return [];
    }

    // ── 2. Batch-fetch profiles ────────────────────────────────────────────
    const userIds = authUsers.map((u) => u.id);

    const { data: profiles, error: profilesErr } = await db
      .from("profiles")
      .select("id, full_name, role")
      .in("id", userIds);

    if (profilesErr) {
      logger.error({ err: profilesErr }, "UserManagementService.listUsers: profiles SELECT failed");
      throw AppError.internal("Failed to fetch user profiles");
    }

    // ── 3. Build a lookup map for O(1) merge ──────────────────────────────
    const profileMap = new Map<string, ProfileRow>(
      (profiles as ProfileRow[]).map((p) => [p.id, p])
    );

    // ── 4. Merge and return ────────────────────────────────────────────────
    return authUsers.map((user): UserRow => {
      const profile = profileMap.get(user.id);
      return {
        id: user.id,
        email: user.email ?? "",
        fullName: profile?.full_name ?? user.user_metadata?.full_name ?? null,
        role: (profile?.role ?? user.user_metadata?.role ?? "internal_submitter") as AppRole,
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at ?? null,
      };
    });
  }

  /**
   * createUser — create a new Auth user with email_confirm:true, upsert profile, audit log.
   *
   * @param input   - Validated CreateUserInput (email, password, role, fullName?).
   * @param adminId - UUID of the admin performing the action (for audit + created_by).
   * @returns The newly created UserRow.
   */
  async createUser(input: CreateUserInput, adminId: string): Promise<UserRow> {
    const { email, password, role, fullName } = input;
    const db = createAdminSupabaseClient();

    // ── 1. Create the Auth user ────────────────────────────────────────────
    const { data: authData, error: authErr } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName ?? null,
        role,
      },
    });

    if (authErr || !authData.user) {
      logger.error(
        { err: authErr, email },
        "UserManagementService.createUser: auth.admin.createUser failed"
      );
      throw AppError.internal("Failed to create user");
    }

    const newUser = authData.user;

    // ── 2. Upsert the profile row ──────────────────────────────────────────
    const { error: profileErr } = await db.from("profiles").upsert(
      {
        id: newUser.id,
        email,
        full_name: fullName ?? null,
        role,
      },
      { onConflict: "id" }
    );

    if (profileErr) {
      // User was created in Auth but profile upsert failed — log for reconciliation.
      logger.error(
        { err: profileErr, userId: newUser.id },
        "UserManagementService.createUser: profiles UPSERT failed (Auth user created — reconciliation needed)"
      );
      throw AppError.internal("Failed to create user profile");
    }

    // ── 3. Audit log ───────────────────────────────────────────────────────
    await adminAuditLogService.log({
      action: "user_created",
      adminId,
      targetType: "user",
      targetId: newUser.id,
      metadata: {
        email,
        role,
        fullName: fullName ?? "",
      },
    });

    return {
      id: newUser.id,
      email,
      fullName: fullName ?? null,
      role,
      createdAt: newUser.created_at,
      lastSignInAt: newUser.last_sign_in_at ?? null,
    };
  }

  /**
   * updateUserRole — change a user's role.
   *
   * Guard: if the admin is changing their own role to a non-admin role, at least
   * one other admin must exist — otherwise the operation is forbidden to prevent
   * locking out all admins.
   *
   * Steps:
   *   1. Guard self-demotion (if applicable).
   *   2. UPDATE profiles.role.
   *   3. auth.admin.updateUserById → user_metadata.role.
   *   4. Audit log.
   *
   * @param userId  - Target user's UUID.
   * @param role    - New role to assign.
   * @param adminId - Admin performing the action.
   * @returns Updated UserRow.
   */
  async updateUserRole(userId: string, role: AppRole, adminId: string): Promise<UserRow> {
    const db = createAdminSupabaseClient();

    // ── 1. Guard: self-demotion check ──────────────────────────────────────
    if (adminId === userId && role !== "admin") {
      // Ensure at least one other admin exists before demoting self.
      const otherAdminCount = await this._countOtherAdmins(adminId);
      if (otherAdminCount === 0) {
        throw AppError.forbidden(
          "Cannot remove your own admin role — at least one other admin must exist first."
        );
      }
    }

    // ── 2. Fetch current user data for the return value ────────────────────
    const { data: existingProfile, error: fetchErr } = await db
      .from("profiles")
      .select("full_name, role")
      .eq("id", userId)
      .single<Pick<ProfileRow, "full_name" | "role">>();

    if (fetchErr || !existingProfile) {
      logger.error(
        { err: fetchErr, userId },
        "UserManagementService.updateUserRole: profile not found"
      );
      throw AppError.notFound("User not found");
    }

    const previousRole = existingProfile.role;

    // ── 3. UPDATE profiles.role ────────────────────────────────────────────
    const { error: profileErr } = await db.from("profiles").update({ role }).eq("id", userId);

    if (profileErr) {
      logger.error(
        { err: profileErr, userId },
        "UserManagementService.updateUserRole: profiles UPDATE failed"
      );
      throw AppError.internal("Failed to update user role");
    }

    // ── 4. UPDATE auth user_metadata.role ─────────────────────────────────
    const { error: authErr } = await db.auth.admin.updateUserById(userId, {
      user_metadata: { role },
    });

    if (authErr) {
      // Profile was updated but auth metadata failed — log for reconciliation.
      logger.error(
        { err: authErr, userId },
        "UserManagementService.updateUserRole: auth.admin.updateUserById failed (profile updated — reconciliation needed)"
      );
      throw AppError.internal("Failed to update user auth metadata");
    }

    // ── 5. Fetch refreshed Auth user for return value ──────────────────────
    const { data: authData, error: authFetchErr } = await db.auth.admin.getUserById(userId);

    if (authFetchErr || !authData.user) {
      logger.error(
        { err: authFetchErr, userId },
        "UserManagementService.updateUserRole: auth.admin.getUserById failed after update"
      );
      throw AppError.internal("Failed to retrieve updated user");
    }

    const authUser = authData.user as AuthUser;

    // ── 6. Audit log ───────────────────────────────────────────────────────
    await adminAuditLogService.log({
      action: "user_role_changed",
      adminId,
      targetType: "user",
      targetId: userId,
      metadata: {
        previousRole,
        newRole: role,
      },
    });

    return {
      id: authUser.id,
      email: authUser.email ?? "",
      fullName: existingProfile.full_name,
      role,
      createdAt: authUser.created_at,
      lastSignInAt: authUser.last_sign_in_at ?? null,
    };
  }

  /**
   * deleteUser — delete a user from Auth (cascades to profile via FK).
   *
   * Guard: self-delete is always forbidden.
   *
   * Steps:
   *   1. Guard self-delete.
   *   2. Fetch profile for audit metadata (email, role).
   *   3. Delete profile row first (explicit, even if cascade is configured).
   *   4. auth.admin.deleteUser.
   *   5. Audit log.
   *
   * @param userId  - Target user's UUID.
   * @param adminId - Admin performing the action.
   */
  async deleteUser(userId: string, adminId: string): Promise<void> {
    // ── 1. Guard: self-delete ──────────────────────────────────────────────
    if (userId === adminId) {
      throw AppError.forbidden("Cannot delete your own account");
    }

    const db = createAdminSupabaseClient();

    // ── 2. Fetch user data for audit metadata ──────────────────────────────
    const { data: authData, error: authFetchErr } = await db.auth.admin.getUserById(userId);

    if (authFetchErr || !authData.user) {
      logger.error(
        { err: authFetchErr, userId },
        "UserManagementService.deleteUser: auth.admin.getUserById failed"
      );
      throw AppError.notFound("User not found");
    }

    const targetUser = authData.user as AuthUser;

    // Fetch profile for role info (best-effort — not fatal if missing)
    const { data: profile } = await db
      .from("profiles")
      .select("role, full_name")
      .eq("id", userId)
      .single<Pick<ProfileRow, "role" | "full_name">>();

    // ── 3. Delete profile row ──────────────────────────────────────────────
    // Explicit delete ensures cleanup even if DB cascade is not configured.
    const { error: profileDeleteErr } = await db.from("profiles").delete().eq("id", userId);

    if (profileDeleteErr) {
      logger.error(
        { err: profileDeleteErr, userId },
        "UserManagementService.deleteUser: profiles DELETE failed"
      );
      throw AppError.internal("Failed to delete user profile");
    }

    // ── 4. Delete Auth user ────────────────────────────────────────────────
    const { error: authDeleteErr } = await db.auth.admin.deleteUser(userId);

    if (authDeleteErr) {
      logger.error(
        { err: authDeleteErr, userId },
        "UserManagementService.deleteUser: auth.admin.deleteUser failed (profile deleted — reconciliation needed)"
      );
      throw AppError.internal("Failed to delete user account");
    }

    // ── 5. Audit log ───────────────────────────────────────────────────────
    await adminAuditLogService.log({
      action: "user_deleted",
      adminId,
      targetType: "user",
      targetId: userId,
      metadata: {
        email: targetUser.email ?? "",
        role: profile?.role ?? "unknown",
      },
    });
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * _countOtherAdmins — count how many admin-role users exist, excluding `excludeId`.
   *
   * Used by the self-demotion guard in updateUserRole to check if at least one
   * other admin remains before allowing the operation.
   *
   * @param excludeId - UUID of the admin whose own record should be excluded.
   * @returns Number of other active admin users.
   */
  private async _countOtherAdmins(excludeId: string): Promise<number> {
    const db = createAdminSupabaseClient();

    const { count, error } = await db
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .neq("id", excludeId);

    if (error) {
      logger.error(
        { err: error, excludeId },
        "UserManagementService._countOtherAdmins: profiles SELECT failed"
      );
      // Fail safe — assume no other admins exist so the guard blocks the operation.
      return 0;
    }

    return count ?? 0;
  }
}

// ─── Singleton export ──────────────────────────────────────────────────────────

/** Singleton — import this everywhere; do not instantiate directly. */
export const userManagementService = new UserManagementService();
