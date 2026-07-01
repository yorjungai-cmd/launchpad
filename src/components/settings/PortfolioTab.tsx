"use client";

/**
 * PortfolioTab — Product Portfolio Settings UI
 *
 * Admin interface for managing the product portfolio used in AI analysis
 * portfolio matching. Supports add, edit (inline form), and delete
 * (inline confirmation) operations.
 *
 * State machine (UiState):
 *   - idle    → show product cards + "Add Product" button
 *   - adding  → show empty ProductForm appended below list
 *   - editing → replace target card with pre-filled ProductForm
 *   - deleting → replace target card with DeleteConfirmation
 *
 * Data flow:
 *   api.admin.getPortfolioConfig.useQuery()       → load products
 *   api.admin.updatePortfolioConfig.useMutation() → save full products array
 *
 * Task 8
 */

import * as React from "react";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import type { Product } from "@/modules/admin-ai-config/schemas";

// ─── Types ────────────────────────────────────────────────────────────────────

type FormState = {
  id: string;
  name: string;
  category: string;
  description: string;
  targetUsers: string;
};

const EMPTY_FORM: FormState = {
  id: "",
  name: "",
  category: "",
  description: "",
  targetUsers: "",
};

// ─── usePortfolioConfig hook ──────────────────────────────────────────────────

function usePortfolioConfig() {
  const utils = api.useUtils();
  const query = api.admin.getPortfolioConfig.useQuery();
  const mutation = api.admin.updatePortfolioConfig.useMutation({
    onSuccess: () => {
      void utils.admin.getPortfolioConfig.invalidate();
    },
  });

  function saveProducts(products: Product[]) {
    mutation.mutate({ products });
  }

  return {
    products: query.data?.products ?? [],
    isLoading: query.isLoading,
    isSaving: mutation.isPending,
    saveError: mutation.error?.message,
    saveProducts,
  };
}

// ─── ProductCard ──────────────────────────────────────────────────────────────

function ProductCard({
  product,
  onEdit,
  onDelete,
}: {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              {product.id}
            </span>
            <span className="text-sm font-semibold text-foreground">{product.name}</span>
            <span className="text-xs text-muted-foreground">{product.category}</span>
          </div>

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            {expanded ? "ซ่อน" : "Target Users"}
          </button>

          {expanded && (
            <p className="mt-1 text-xs text-muted-foreground">{product.targetUsers}</p>
          )}
        </div>

        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${product.name}`}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${product.name}`}
            className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DeleteConfirmation ───────────────────────────────────────────────────────

function DeleteConfirmation({
  product,
  onConfirm,
  onCancel,
}: {
  product: Product;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
      <p className="text-sm text-foreground">
        Remove <strong>{product.name}</strong> from portfolio? Existing analyses referencing it
        will still display the original product name.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
        >
          Confirm Delete
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── ProductForm ──────────────────────────────────────────────────────────────

function ProductForm({
  initial,
  isEdit,
  onSave,
  onCancel,
  existingIds,
}: {
  initial: FormState;
  isEdit: boolean;
  onSave: (form: FormState) => void;
  onCancel: () => void;
  existingIds: string[];
}) {
  const [form, setForm] = React.useState<FormState>(initial);
  const [error, setError] = React.useState<string | null>(null);

  function handleChange(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.id.trim()) {
      setError("Product ID is required");
      return;
    }
    if (/\s/.test(form.id)) {
      setError("Product ID must not contain spaces");
      return;
    }
    if (!isEdit && existingIds.includes(form.id)) {
      setError("Product ID already exists");
      return;
    }
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    if (!form.category.trim()) {
      setError("Category is required");
      return;
    }
    if (!form.description.trim()) {
      setError("Description is required");
      return;
    }
    if (!form.targetUsers.trim()) {
      setError("Target Users is required");
      return;
    }
    onSave(form);
  }

  const inputClass =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const labelClass = "block text-xs font-medium text-foreground mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">{isEdit ? "Edit Product" : "Add Product"}</h3>

      <div>
        <label className={labelClass} htmlFor="product-id">
          Product ID{" "}
          {isEdit && (
            <span className="ml-1 text-xs text-muted-foreground">
              (read-only — changing ID breaks historical analyses)
            </span>
          )}
        </label>
        <input
          id="product-id"
          type="text"
          value={form.id}
          onChange={(e) => handleChange("id", e.target.value)}
          readOnly={isEdit}
          placeholder="e.g. PTCAD"
          className={cn(inputClass, isEdit && "cursor-not-allowed opacity-60")}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="product-name">
          Name
        </label>
        <input
          id="product-name"
          type="text"
          value={form.name}
          onChange={(e) => handleChange("name", e.target.value)}
          placeholder="e.g. PTCAD AI"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="product-category">
          Category
        </label>
        <input
          id="product-category"
          type="text"
          value={form.category}
          onChange={(e) => handleChange("category", e.target.value)}
          placeholder="e.g. CAD / Engineering Software"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="product-description">
          Description
        </label>
        <textarea
          id="product-description"
          value={form.description}
          onChange={(e) => handleChange("description", e.target.value)}
          rows={3}
          placeholder="Describe the product and its use cases..."
          className={cn(inputClass, "resize-y")}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="product-target-users">
          Target Users
        </label>
        <textarea
          id="product-target-users"
          value={form.targetUsers}
          onChange={(e) => handleChange("targetUsers", e.target.value)}
          rows={2}
          placeholder="e.g. Engineers, R&D teams, SME manufacturers"
          className={cn(inputClass, "resize-y")}
        />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── PortfolioTab ─────────────────────────────────────────────────────────────

type UiState =
  | { type: "idle" }
  | { type: "adding" }
  | { type: "editing"; index: number }
  | { type: "deleting"; index: number };

export function PortfolioTab() {
  const { products, isLoading, isSaving, saveError, saveProducts } = usePortfolioConfig();
  const [ui, setUi] = React.useState<UiState>({ type: "idle" });

  function handleAdd(form: FormState) {
    saveProducts([...products, form]);
    setUi({ type: "idle" });
  }

  function handleEdit(index: number, form: FormState) {
    const next = products.map((p, i) => (i === index ? form : p));
    saveProducts(next);
    setUi({ type: "idle" });
  }

  function handleDelete(index: number) {
    const next = products.filter((_, i) => i !== index);
    saveProducts(next);
    setUi({ type: "idle" });
  }

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4" aria-busy="true">
        <div className="h-5 w-40 rounded bg-muted" />
        <div className="h-16 w-full rounded-lg bg-muted" />
        <div className="h-16 w-full rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Product Portfolio</h2>
          <p className="text-sm text-muted-foreground">
            Products used in AI analysis portfolio matching. Changes apply to new analyses only.
          </p>
        </div>
        {ui.type === "idle" && (
          <button
            type="button"
            onClick={() => setUi({ type: "adding" })}
            disabled={isSaving}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="size-4" />
            Add Product
          </button>
        )}
      </div>

      {saveError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Save failed: {saveError}
        </p>
      )}

      {/* Empty state */}
      {products.length === 0 && ui.type !== "adding" && (
        <div className="flex min-h-[80px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6">
          <p className="text-sm text-muted-foreground">
            No products configured. Add one to enable portfolio matching.
          </p>
        </div>
      )}

      {/* Product list */}
      <div className="space-y-2">
        {products.map((product, index) => {
          if (ui.type === "editing" && ui.index === index) {
            return (
              <ProductForm
                key={product.id}
                initial={product}
                isEdit={true}
                onSave={(form) => handleEdit(index, form)}
                onCancel={() => setUi({ type: "idle" })}
                existingIds={products.map((p) => p.id)}
              />
            );
          }
          if (ui.type === "deleting" && ui.index === index) {
            return (
              <DeleteConfirmation
                key={product.id}
                product={product}
                onConfirm={() => handleDelete(index)}
                onCancel={() => setUi({ type: "idle" })}
              />
            );
          }
          return (
            <ProductCard
              key={product.id}
              product={product}
              onEdit={() => setUi({ type: "editing", index })}
              onDelete={() => setUi({ type: "deleting", index })}
            />
          );
        })}
      </div>

      {/* Add form */}
      {ui.type === "adding" && (
        <ProductForm
          initial={EMPTY_FORM}
          isEdit={false}
          onSave={handleAdd}
          onCancel={() => setUi({ type: "idle" })}
          existingIds={products.map((p) => p.id)}
        />
      )}
    </div>
  );
}

export default PortfolioTab;
