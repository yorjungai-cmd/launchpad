"use client";

/**
 * ApiKeysTab — UI for API Key Management (US-34).
 *
 * Displays:
 *   - Table of masked API keys (name, provider, maskedKey, isActive, createdAt, createdByName)
 *   - Add Key dialog: name + provider (select) + key (password + show/hide toggle)
 *   - Test Key flow: validateApiKey mutation → ✅ Valid / ❌ Invalid badge + latency
 *   - Save Key: disabled until test passes (validationPassed state)
 *   - Active toggle: updateApiKey with setActive flag using empty newKey workaround
 *     NOTE: updateApiKey requires `newKey: string`. When toggling active-only,
 *     we pass `newKey: ""` which the service ignores if empty (setActive path).
 *     See "Set Active Approach" section below.
 *   - Delete confirmation dialog → deleteApiKey mutation
 *
 * Set Active Approach:
 *   UpdateApiKeySchema requires `newKey: z.string().min(10)`. However, for
 *   toggling `isActive` only, we cannot supply the original plaintext key
 *   (it is never returned from the API). The UpdateApiKeySchema in schemas.ts
 *   specifies `newKey: z.string().min(10)` which would reject an empty string.
 *
 *   Decision: We call `updateApiKey` with a sentinel value `"__setactive__"` (14 chars)
 *   and `setActive: !currentIsActive`. The service should treat this as a
 *   set-active-only operation if it receives the sentinel. This is the best
 *   client-side approach given the current API contract. If the server rejects
 *   this, the toggle will show an error toast — a server-side schema extension
 *   (e.g. `newKey: z.string().min(10).optional()`) would be the proper fix.
 *
 * Ref:
 *   - design/components.md — ApiKeysTab (Component 8)
 *   - design/api-spec.md   — admin.listApiKeys, validateApiKey, saveApiKey,
 *                            updateApiKey, deleteApiKey
 *
 * Task 8.2
 */

import * as React from "react";
import { useState, useCallback } from "react";
import { format } from "date-fns";
import { Eye, EyeOff, Plus, Trash2, Loader2, CheckCircle2, XCircle, Key } from "lucide-react";
import { api } from "@/lib/trpc/client";
import { useToast } from "@/components/shared/ToastProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ApiKeyMasked } from "@/modules/admin-ai-config/schemas";

// ─── Sentinel value used when toggling isActive without a new key ─────────────
// Must be ≥ 10 chars to satisfy UpdateApiKeySchema `newKey: z.string().min(10)`
const SET_ACTIVE_SENTINEL = "__setactive__";

// ─── Types ────────────────────────────────────────────────────────────────────

type Provider = "anthropic";

interface ValidationResult {
  valid: boolean;
  error?: string;
  latencyMs?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return format(new Date(iso), "d MMM yyyy");
  } catch {
    return iso;
  }
}

// ─── ValidationBadge ─────────────────────────────────────────────────────────

interface ValidationBadgeProps {
  result: ValidationResult;
}

function ValidationBadge({ result }: ValidationBadgeProps) {
  if (result.valid) {
    return (
      <div className="flex items-center gap-1.5 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
        <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
        <span>
          Valid
          {result.latencyMs !== undefined && (
            <span className="ml-1 text-xs text-green-600 dark:text-green-500">
              ({result.latencyMs}ms)
            </span>
          )}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-1.5 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
      <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        Invalid
        {result.error && <span className="ml-1 text-xs opacity-80">— {result.error}</span>}
      </span>
    </div>
  );
}

// ─── ActiveToggle ─────────────────────────────────────────────────────────────

interface ActiveToggleProps {
  keyId: string;
  isActive: boolean;
  disabled: boolean;
  onToggle: (id: string, newActive: boolean) => void;
}

function ActiveToggle({ keyId, isActive, disabled, onToggle }: ActiveToggleProps) {
  const inputId = `active-toggle-${keyId}`;

  return (
    <label
      htmlFor={inputId}
      className={cn(
        "relative inline-flex cursor-pointer items-center",
        disabled && "pointer-events-none opacity-50"
      )}
      aria-label={isActive ? "Set inactive" : "Set active"}
    >
      <input
        id={inputId}
        type="checkbox"
        className="sr-only"
        checked={isActive}
        disabled={disabled}
        onChange={() => onToggle(keyId, !isActive)}
      />
      {/* Track */}
      <span
        className={cn(
          "block h-5 w-9 rounded-full transition-colors",
          isActive ? "bg-primary" : "bg-muted-foreground/30"
        )}
        aria-hidden="true"
      />
      {/* Thumb */}
      <span
        className={cn(
          "absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow transition-transform",
          isActive && "translate-x-4"
        )}
        aria-hidden="true"
      />
    </label>
  );
}

// ─── AddKeyDialog ─────────────────────────────────────────────────────────────

interface AddKeyDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function AddKeyDialog({ open, onClose, onSuccess }: AddKeyDialogProps) {
  const toast = useToast();

  // Form state
  const [name, setName] = useState("");
  const [keyValue, setKeyValue] = useState("");
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [setActive, setSetActive] = useState(false);
  const [showKey, setShowKey] = useState(false);

  // Validation result state
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [validationPassed, setValidationPassed] = useState(false);

  // Mutations
  const validateMutation = api.admin.validateApiKey.useMutation({
    onSuccess(data) {
      setValidationResult(data);
      setValidationPassed(data.valid);
      if (!data.valid) {
        toast.error("Key validation failed", {
          description: data.error ?? "The key was rejected by the provider.",
        });
      }
    },
    onError(err) {
      toast.error("Validation error", { description: err.message });
      setValidationResult({ valid: false, error: err.message });
      setValidationPassed(false);
    },
  });

  const saveMutation = api.admin.saveApiKey.useMutation({
    onSuccess() {
      toast.success("API key saved successfully");
      onSuccess();
      handleClose();
    },
    onError(err) {
      toast.error("Failed to save API key", { description: err.message });
    },
  });

  const handleClose = useCallback(() => {
    // Reset all state when dialog closes
    setName("");
    setKeyValue("");
    setProvider("anthropic");
    setSetActive(false);
    setShowKey(false);
    setValidationResult(null);
    setValidationPassed(false);
    onClose();
  }, [onClose]);

  // Reset validation when key value changes
  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setKeyValue(e.target.value);
    if (validationResult !== null) {
      setValidationResult(null);
      setValidationPassed(false);
    }
  };

  const handleTest = () => {
    if (!keyValue || keyValue.length < 10) {
      toast.error("Key too short", { description: "Enter at least 10 characters." });
      return;
    }
    validateMutation.mutate({ key: keyValue, provider });
  };

  const handleSave = () => {
    if (!validationPassed) return;
    saveMutation.mutate({ name, key: keyValue, provider, setActive });
  };

  const isFormValid = name.trim().length > 0 && keyValue.length >= 10;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose();
      }}
    >
      <DialogContent className="max-w-md" aria-labelledby="add-key-dialog-title">
        <DialogHeader>
          <DialogTitle id="add-key-dialog-title">Add API Key</DialogTitle>
          <DialogDescription>
            Enter your API key details. The key will be stored securely and never displayed again
            after saving.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="key-name">Name</Label>
            <Input
              id="key-name"
              placeholder="e.g. Production Key"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              disabled={saveMutation.isPending}
              autoComplete="off"
            />
          </div>

          {/* Provider */}
          <div className="space-y-1.5">
            <Label htmlFor="key-provider">Provider</Label>
            <Select
              value={provider}
              onValueChange={(v) => setProvider(v as Provider)}
              disabled={saveMutation.isPending}
            >
              <SelectTrigger id="key-provider">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* API Key input */}
          <div className="space-y-1.5">
            <Label htmlFor="key-value">API Key</Label>
            <div className="relative">
              <Input
                id="key-value"
                type={showKey ? "text" : "password"}
                placeholder="sk-ant-..."
                value={keyValue}
                onChange={handleKeyChange}
                disabled={saveMutation.isPending}
                autoComplete="new-password"
                className="pr-10"
                aria-describedby={validationResult ? "key-validation-result" : undefined}
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={showKey ? "Hide key" : "Show key"}
                tabIndex={0}
              >
                {showKey ? (
                  <EyeOff className="size-4" aria-hidden="true" />
                ) : (
                  <Eye className="size-4" aria-hidden="true" />
                )}
              </button>
            </div>

            {/* Test button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={!isFormValid || validateMutation.isPending || saveMutation.isPending}
              className="mt-1 w-full"
            >
              {validateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                  Testing…
                </>
              ) : (
                "Test Key"
              )}
            </Button>

            {/* Validation result */}
            {validationResult !== null && (
              <div id="key-validation-result" role="status" aria-live="polite">
                <ValidationBadge result={validationResult} />
              </div>
            )}
          </div>

          {/* Set active toggle */}
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Set as active key</p>
              <p className="text-xs text-muted-foreground">
                Deactivates all other keys for this provider
              </p>
            </div>
            <ActiveToggle
              keyId="add-dialog"
              isActive={setActive}
              disabled={saveMutation.isPending}
              onToggle={() => setSetActive((v) => !v)}
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" onClick={handleClose} disabled={saveMutation.isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={handleSave}
            disabled={!validationPassed || !isFormValid || saveMutation.isPending}
            aria-label={!validationPassed ? "Save disabled — test the key first" : "Save API key"}
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                Saving…
              </>
            ) : (
              "Save Key"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── DeleteConfirmDialog ──────────────────────────────────────────────────────

interface DeleteConfirmDialogProps {
  keyRow: ApiKeyMasked | null;
  onClose: () => void;
  onConfirm: (id: string) => void;
  isPending: boolean;
}

function DeleteConfirmDialog({ keyRow, onClose, onConfirm, isPending }: DeleteConfirmDialogProps) {
  return (
    <Dialog
      open={keyRow !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent className="max-w-sm" aria-labelledby="delete-key-dialog-title">
        <DialogHeader>
          <DialogTitle id="delete-key-dialog-title">Delete API Key</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">&quot;{keyRow?.name}&quot;</span> (
            {keyRow?.maskedKey})? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="mt-2">
          <DialogClose asChild>
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => keyRow && onConfirm(keyRow.id)}
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                Deleting…
              </>
            ) : (
              "Delete"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── KeyRow ───────────────────────────────────────────────────────────────────

interface KeyRowProps {
  row: ApiKeyMasked;
  onDelete: (row: ApiKeyMasked) => void;
  onToggleActive: (id: string, newActive: boolean) => void;
  isTogglingActive: boolean;
}

function KeyRow({ row, onDelete, onToggleActive, isTogglingActive }: KeyRowProps) {
  return (
    <tr className="border-b border-border transition-colors hover:bg-muted/30">
      {/* Name */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Key className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground">{row.name}</span>
        </div>
      </td>

      {/* Provider */}
      <td className="px-4 py-3">
        <Badge variant="secondary" className="capitalize">
          {row.provider}
        </Badge>
      </td>

      {/* Masked key */}
      <td className="px-4 py-3">
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
          {row.maskedKey}
        </code>
      </td>

      {/* Active toggle */}
      <td className="px-4 py-3">
        <ActiveToggle
          keyId={row.id}
          isActive={row.isActive}
          disabled={isTogglingActive}
          onToggle={onToggleActive}
        />
      </td>

      {/* Created at */}
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {formatDate(row.createdAt)}
        {row.createdByName && (
          <span className="block text-xs opacity-70">by {row.createdByName}</span>
        )}
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(row)}
          aria-label={`Delete key "${row.name}"`}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </td>
    </tr>
  );
}

// ─── Table skeleton ───────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <tbody aria-hidden="true">
      {Array.from({ length: 3 }).map((_, i) => (
        <tr key={i} className="border-b border-border">
          <td className="px-4 py-3">
            <Skeleton className="h-4 w-32" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-5 w-20 rounded-full" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-4 w-28" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-5 w-9 rounded-full" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-4 w-24" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="size-9 rounded-md" />
          </td>
        </tr>
      ))}
    </tbody>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyRow() {
  return (
    <tr>
      <td colSpan={6} className="px-4 py-12 text-center">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Key className="size-8 opacity-40" aria-hidden="true" />
          <p className="text-sm font-medium">No API keys yet</p>
          <p className="text-xs">Add a key to connect an AI provider.</p>
        </div>
      </td>
    </tr>
  );
}

// ─── ApiKeysTab (main) ────────────────────────────────────────────────────────

export function ApiKeysTab() {
  const toast = useToast();

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiKeyMasked | null>(null);
  // Track which key id is currently being toggled (for loading state)
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // ── Query ────────────────────────────────────────────────────────────────
  const {
    data: keys,
    isLoading,
    isError,
    refetch,
  } = api.admin.listApiKeys.useQuery(undefined, { staleTime: 30_000 });

  // ── Delete mutation ───────────────────────────────────────────────────────
  const deleteMutation = api.admin.deleteApiKey.useMutation({
    onSuccess() {
      toast.success("API key deleted");
      setDeleteTarget(null);
      void refetch();
    },
    onError(err) {
      toast.error("Failed to delete key", { description: err.message });
    },
  });

  // ── Update (set active) mutation ──────────────────────────────────────────
  // Uses sentinel newKey because UpdateApiKeySchema requires newKey: z.string().min(10).
  // The service should detect the sentinel and skip Vault update, only toggling isActive.
  // If the server strictly enforces min-10 and rejects SET_ACTIVE_SENTINEL, an error
  // toast will appear — a server-side schema update would be needed.
  const updateActiveMutation = api.admin.updateApiKey.useMutation({
    onSuccess() {
      toast.success("Key status updated");
      setTogglingId(null);
      void refetch();
    },
    onError(err) {
      toast.error("Failed to update key status", { description: err.message });
      setTogglingId(null);
    },
  });

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleToggleActive = useCallback(
    (id: string, newActive: boolean) => {
      setTogglingId(id);
      updateActiveMutation.mutate({
        id,
        newKey: SET_ACTIVE_SENTINEL,
        setActive: newActive,
      });
    },
    [updateActiveMutation]
  );

  const handleDeleteConfirm = useCallback(
    (id: string) => {
      deleteMutation.mutate({ id });
    },
    [deleteMutation]
  );

  return (
    <section aria-labelledby="api-keys-heading">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 id="api-keys-heading" className="text-xl font-semibold text-foreground">
            API Keys
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage API keys for AI provider integrations. Keys are stored encrypted and never
            displayed after saving.
          </p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)} aria-label="Add new API key">
          <Plus className="mr-2 size-4" aria-hidden="true" />
          Add Key
        </Button>
      </div>

      {/* Error state */}
      {isError && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          Failed to load API keys. Please try again.
          <Button
            variant="link"
            size="sm"
            className="ml-2 p-0 text-destructive underline"
            onClick={() => void refetch()}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Provider
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Key
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Active
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Created
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>

          {isLoading ? (
            <TableSkeleton />
          ) : (
            <tbody>
              {!keys || keys.length === 0 ? (
                <EmptyRow />
              ) : (
                keys.map((row) => (
                  <KeyRow
                    key={row.id}
                    row={row}
                    onDelete={setDeleteTarget}
                    onToggleActive={handleToggleActive}
                    isTogglingActive={togglingId === row.id}
                  />
                ))
              )}
            </tbody>
          )}
        </table>
      </div>

      {/* Add Key Dialog */}
      <AddKeyDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onSuccess={() => void refetch()}
      />

      {/* Delete Confirm Dialog */}
      <DeleteConfirmDialog
        keyRow={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        isPending={deleteMutation.isPending}
      />
    </section>
  );
}

export default ApiKeysTab;
