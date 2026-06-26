/**
 * Auth module — tRPC router.
 *
 * Procedures:
 *   auth.session             — publicProcedure   → current session or null
 *   auth.signInWithPassword  — publicProcedure   → input: { email, password }
 *   auth.signInWithMagicLink — publicProcedure   → input: { email }
 *   auth.signOut             — protectedProcedure → void
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "@/server/trpc";
import { emailSchema } from "@/shared/schemas/common";
import { AppError } from "@/lib/errors/AppError";

export const authRouter = router({
  /**
   * Returns the current session info (user id, email, role) or null.
   * Safe to call client-side to bootstrap auth state.
   */
  session: publicProcedure.query(({ ctx }) => {
    if (!ctx.session || !ctx.user) {
      return null;
    }
    return {
      userId: ctx.user.id,
      email: ctx.user.email ?? null,
      role: ctx.role,
    };
  }),

  /**
   * Sign in with email + password.
   * Returns user data on success; throws on auth failure.
   */
  signInWithPassword: publicProcedure
    .input(
      z.object({
        email: emailSchema,
        password: z.string().min(1, "Password is required"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.db.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });

      if (error || !data.user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: error?.message ?? "Invalid email or password.",
          cause: AppError.unauthorized(error?.message ?? "Invalid email or password."),
        });
      }

      return {
        userId: data.user.id,
        email: data.user.email ?? null,
      };
    }),

  /**
   * Send a magic link to the given email address.
   * Always returns { sent: true } to avoid email enumeration.
   */
  signInWithMagicLink: publicProcedure
    .input(
      z.object({
        email: emailSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.db.auth.signInWithOtp({
        email: input.email,
        options: {
          shouldCreateUser: true,
        },
      });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send magic link. Please try again.",
          cause: AppError.internal(error.message),
        });
      }

      return { sent: true };
    }),

  /**
   * Sign out the current authenticated user.
   * Clears the auth session cookie.
   */
  signOut: protectedProcedure.mutation(async ({ ctx }) => {
    const { error } = await ctx.db.auth.signOut();

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to sign out.",
        cause: AppError.internal(error.message),
      });
    }

    return { success: true };
  }),
});
