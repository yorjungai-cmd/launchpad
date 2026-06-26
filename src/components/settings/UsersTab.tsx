"use client";

/**
 * UsersTab — Admin user management tab inside the Settings page.
 *
 * Features:
 *   - Table: email, fullName, role (color-coded badge), createdAt, actions
 *   - Invite User dialog: email, password (min 8), role (select, default internal_submitter)
 *     → React Hook Form + Zod → api.admin.createUser mutation
 *   - Inline role select per row → api.admin.updateUserRole mutation
 *   - Delete button (disabled for self) → confirmation dialog → api.admin.deleteUser mutation
 *   - Loading skeleton, error display, empty state
 *   - Current user obtained via useSession() from @/lib/auth/hooks
 *
 * Task 8.3
 */

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { UserPlus, Trash2, Loader2 } from "lucide-react";
import { format } from "date-fns";

import { api } from "@/lib/trpc/client";
import { useSession } from "@/lib/auth/hooks";
import { useToast } from "@/components/shared/ToastProvider";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import type { UserRow, AppRole } from "@/modules/admin-ai-config/schemas";
import { UserRole } from "@/shared/enums";

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: UserRole.INTERNAL_SUBMITTER, label: "Internal Submitter" },
  { value: UserRole.BD_REVIEWER, label: "BD Reviewer" },
  { value: UserRole.ADMIN, label: "Admin" },
];

const ROLE_LABELS: Record<AppRole, string> = {
  [UserRole.INTERNAL_SUBMITTER]: "Internal Submitter",
  [UserRole.BD_REVIEWER]: "BD Reviewer",
  [UserRole.ADMIN]: "Admin",
};

// ─── Invite form schema ───────────────────────────────────────────────────────

const inviteFormSchema = z.object({
  email: z.string().email("กรุณากรอก email ที่ถูกต้อง"),
  password: z.string().min(8, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"),
  role: z.enum([UserRole.INTERNAL_SUBMITTER, UserRole.BD_REVIEWER, UserRole.ADMIN]),
  fullName: z.string().max(100).optional(),
});

type InviteFormValues = z.infer<typeof inviteFormSchema>;

// ─── Role badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const roleClass =
    role === UserRole.ADMIN
      ? "border-transparent bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
      : role === UserRole.BD_REVIEWER
        ? "border-transparent bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
        : "border-transparent bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400";

  const label = ROLE_LABELS[role as AppRole] ?? role;

  return (
    <Badge className={cn("text-xs font-medium", roleClass)} aria-label={`บทบาท: ${label}`}>
      {label}
    </Badge>
  );
}

// ─── Delete confirmation dialog ───────────────────────────────────────────────

interface DeleteConfirmDialogProps {
  user: UserRow;
  isOpen: boolean;
  isPending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

function DeleteConfirmDialog({
  user,
  isOpen,
  isPending,
  onConfirm,
  onClose,
}: DeleteConfirmDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ยืนยันการลบผู้ใช้</DialogTitle>
          <DialogDescription>
            คุณต้องการลบ{" "}
            <span className="font-semibold text-foreground">{user.fullName ?? user.email}</span> (
            {user.email}) ออกจากระบบ? การดำเนินการนี้ไม่สามารถย้อนกลับได้
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            ยกเลิก
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
            aria-busy={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                กำลังลบ...
              </>
            ) : (
              "ลบผู้ใช้"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Invite user dialog ───────────────────────────────────────────────────────

interface InviteUserDialogProps {
  onSuccess: () => void;
}

function InviteUserDialog({ onSuccess }: InviteUserDialogProps) {
  const [open, setOpen] = React.useState(false);
  const toast = useToast();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: {
      email: "",
      password: "",
      role: UserRole.INTERNAL_SUBMITTER,
      fullName: "",
    },
  });

  const createUser = api.admin.createUser.useMutation({
    onSuccess: (data) => {
      toast.success("เพิ่มผู้ใช้สำเร็จ", {
        description: `${data.email} ถูกเพิ่มในระบบแล้ว`,
      });
      reset();
      setOpen(false);
      onSuccess();
    },
    onError: (err) => {
      toast.error("เกิดข้อผิดพลาด", { description: err.message });
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    await createUser.mutateAsync({
      email: values.email,
      password: values.password,
      role: values.role as AppRole,
      fullName: values.fullName ?? undefined,
    });
  });

  const isLoading = isSubmitting || createUser.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) reset();
        setOpen(val);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="mr-2 size-4" aria-hidden="true" />
          เพิ่มผู้ใช้
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>เพิ่มผู้ใช้ใหม่</DialogTitle>
          <DialogDescription>กรอกข้อมูลเพื่อสร้างบัญชีผู้ใช้ใหม่ในระบบ</DialogDescription>
        </DialogHeader>

        <form
          id="invite-user-form"
          onSubmit={onSubmit}
          noValidate
          aria-label="แบบฟอร์มเพิ่มผู้ใช้"
          className="flex flex-col gap-4"
        >
          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email">
              Email{" "}
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
            </Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="user@example.com"
              autoComplete="email"
              {...register("email")}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "invite-email-error" : undefined}
              className={cn(errors.email && "border-destructive")}
            />
            {errors.email && (
              <p id="invite-email-error" role="alert" className="text-xs text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Full name (optional) */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-fullname">ชื่อ-นามสกุล (ไม่บังคับ)</Label>
            <Input
              id="invite-fullname"
              type="text"
              placeholder="ชื่อผู้ใช้"
              autoComplete="name"
              {...register("fullName")}
            />
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-password">
              รหัสผ่าน{" "}
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
            </Label>
            <Input
              id="invite-password"
              type="password"
              placeholder="อย่างน้อย 8 ตัวอักษร"
              autoComplete="new-password"
              {...register("password")}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "invite-password-error" : undefined}
              className={cn(errors.password && "border-destructive")}
            />
            {errors.password && (
              <p id="invite-password-error" role="alert" className="text-xs text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>

          {/* Role */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-role">
              บทบาท{" "}
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
            </Label>
            <Controller
              name="role"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={(val) => field.onChange(val as AppRole)}>
                  <SelectTrigger
                    id="invite-role"
                    aria-describedby={errors.role ? "invite-role-error" : undefined}
                    aria-invalid={!!errors.role}
                    className={cn(errors.role && "border-destructive")}
                  >
                    <SelectValue placeholder="เลือกบทบาท" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.role && (
              <p id="invite-role-error" role="alert" className="text-xs text-destructive">
                {errors.role.message}
              </p>
            )}
          </div>
        </form>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              setOpen(false);
            }}
            disabled={isLoading}
          >
            ยกเลิก
          </Button>
          <Button type="submit" form="invite-user-form" disabled={isLoading} aria-busy={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                กำลังบันทึก...
              </>
            ) : (
              "เพิ่มผู้ใช้"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Table row ────────────────────────────────────────────────────────────────

interface UserRowComponentProps {
  user: UserRow;
  currentUserId: string;
  onRoleChange: (userId: string, role: AppRole) => void;
  onDeleteRequest: (user: UserRow) => void;
  isRoleChangePending: boolean;
  roleChangingUserId: string | null;
}

function UserTableRow({
  user,
  currentUserId,
  onRoleChange,
  onDeleteRequest,
  isRoleChangePending,
  roleChangingUserId,
}: UserRowComponentProps) {
  const isSelf = user.id === currentUserId;
  const isThisRowChangingRole = roleChangingUserId === user.id && isRoleChangePending;

  const formattedDate = React.useMemo(() => {
    try {
      return format(new Date(user.createdAt), "dd/MM/yyyy");
    } catch {
      return user.createdAt;
    }
  }, [user.createdAt]);

  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/30">
      {/* Email / Name */}
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-foreground">{user.email}</span>
          {user.fullName && <span className="text-xs text-muted-foreground">{user.fullName}</span>}
        </div>
      </td>

      {/* Role badge */}
      <td className="px-4 py-3">
        <RoleBadge role={user.role} />
      </td>

      {/* Created at */}
      <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">{formattedDate}</td>

      {/* Inline role change */}
      <td className="px-4 py-3">
        <Select
          value={user.role}
          onValueChange={(val) => onRoleChange(user.id, val as AppRole)}
          disabled={isThisRowChangingRole}
        >
          <SelectTrigger className="h-8 w-44 text-xs" aria-label={`เปลี่ยนบทบาทของ ${user.email}`}>
            {isThisRowChangingRole ? (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                กำลังเปลี่ยน...
              </span>
            ) : (
              <SelectValue />
            )}
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>

      {/* Delete action */}
      <td className="px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDeleteRequest(user)}
          disabled={isSelf}
          title={isSelf ? "ไม่สามารถลบบัญชีของตัวเองได้" : `ลบ ${user.email}`}
          aria-label={isSelf ? "ไม่สามารถลบบัญชีของตัวเองได้" : `ลบผู้ใช้ ${user.email}`}
          className="text-muted-foreground hover:text-destructive disabled:opacity-30"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </td>
    </tr>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function UsersTableSkeleton() {
  return (
    <div role="status" aria-label="กำลังโหลดข้อมูลผู้ใช้" className="space-y-0">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border px-4 py-3">
          <div className="flex flex-1 flex-col gap-1">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-44 rounded-md" />
          <Skeleton className="size-8 rounded-md" />
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function UsersTab() {
  const toast = useToast();
  const { user: currentUser } = useSession();

  // Pending delete state
  const [deleteTarget, setDeleteTarget] = React.useState<UserRow | null>(null);
  // Track which user's role is being changed (for per-row loading indicator)
  const [roleChangingUserId, setRoleChangingUserId] = React.useState<string | null>(null);

  // ── Queries & mutations ──────────────────────────────────────────────────────

  const {
    data: users,
    isLoading,
    error,
    refetch,
  } = api.admin.listUsers.useQuery(undefined, {
    staleTime: 30_000,
  });

  const updateUserRole = api.admin.updateUserRole.useMutation({
    onSuccess: (updated) => {
      toast.success("เปลี่ยนบทบาทสำเร็จ", {
        description: `${updated.email} → ${ROLE_LABELS[updated.role as AppRole] ?? updated.role}`,
      });
      void refetch();
    },
    onError: (err) => {
      toast.error("ไม่สามารถเปลี่ยนบทบาทได้", { description: err.message });
    },
    onSettled: () => {
      setRoleChangingUserId(null);
    },
  });

  const deleteUser = api.admin.deleteUser.useMutation({
    onSuccess: () => {
      toast.success("ลบผู้ใช้สำเร็จ");
      setDeleteTarget(null);
      void refetch();
    },
    onError: (err) => {
      toast.error("ไม่สามารถลบผู้ใช้ได้", { description: err.message });
    },
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleRoleChange = React.useCallback(
    (userId: string, role: AppRole) => {
      setRoleChangingUserId(userId);
      updateUserRole.mutate({ userId, role });
    },
    [updateUserRole]
  );

  const handleDeleteConfirm = React.useCallback(() => {
    if (!deleteTarget) return;
    deleteUser.mutate({ userId: deleteTarget.id });
  }, [deleteTarget, deleteUser]);

  const handleDeleteRequest = React.useCallback((user: UserRow) => {
    setDeleteTarget(user);
  }, []);

  const handleDeleteClose = React.useCallback(() => {
    setDeleteTarget(null);
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <section aria-labelledby="users-tab-heading" className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 id="users-tab-heading" className="text-base font-semibold text-foreground">
            จัดการผู้ใช้
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            เพิ่ม ลบ และจัดการบทบาทของผู้ใช้ในระบบ
          </p>
        </div>
        <InviteUserDialog onSuccess={() => void refetch()} />
      </div>

      {/* Error state */}
      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          ไม่สามารถโหลดข้อมูลผู้ใช้ได้: {error.message}
          <Button
            variant="link"
            size="sm"
            className="ml-2 h-auto p-0 text-destructive underline"
            onClick={() => void refetch()}
          >
            ลองใหม่
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-md border border-border">
        {isLoading ? (
          <UsersTableSkeleton />
        ) : !users || users.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <p className="text-sm font-medium text-foreground">ยังไม่มีผู้ใช้ในระบบ</p>
            <p className="mt-1 text-xs text-muted-foreground">เริ่มต้นโดยเพิ่มผู้ใช้คนแรก</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="รายชื่อผู้ใช้">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Email / ชื่อ
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    บทบาทปัจจุบัน
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    วันที่สร้าง
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    เปลี่ยนบทบาท
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    <span className="sr-only">การดำเนินการ</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <UserTableRow
                    key={user.id}
                    user={user}
                    currentUserId={currentUser?.id ?? ""}
                    onRoleChange={handleRoleChange}
                    onDeleteRequest={handleDeleteRequest}
                    isRoleChangePending={updateUserRole.isPending}
                    roleChangingUserId={roleChangingUserId}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* User count */}
      {users && users.length > 0 && (
        <p className="text-right text-xs text-muted-foreground">{users.length} ผู้ใช้ทั้งหมด</p>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <DeleteConfirmDialog
          user={deleteTarget}
          isOpen={!!deleteTarget}
          isPending={deleteUser.isPending}
          onConfirm={handleDeleteConfirm}
          onClose={handleDeleteClose}
        />
      )}
    </section>
  );
}
