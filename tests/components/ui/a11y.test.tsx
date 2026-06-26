/**
 * Task 9.5 — A11y baseline tests for base UI components.
 *
 * Verifies:
 * - Button: correct role, click handler, keyboard accessible
 * - Input: accessible label association, correct type attribute
 * - Badge: visible text content
 * - EmptyState: role=status accessible markup
 * - Skeleton: role=status with aria-label
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

// ── Button ────────────────────────────────────────────────────────────────────

describe("Button", () => {
  it("renders with implicit button role", () => {
    render(<Button>Submit</Button>);
    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
  });

  it("calls onClick handler when clicked", async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(<Button onClick={handleClick}>Click me</Button>);
    await user.click(screen.getByRole("button", { name: "Click me" }));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("is keyboard accessible — activates on Enter key", async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(<Button onClick={handleClick}>Press me</Button>);
    const btn = screen.getByRole("button", { name: "Press me" });
    btn.focus();
    await user.keyboard("{Enter}");

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("is keyboard accessible — activates on Space key", async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(<Button onClick={handleClick}>Spacebar</Button>);
    const btn = screen.getByRole("button", { name: "Spacebar" });
    btn.focus();
    await user.keyboard(" ");

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("is not interactive when disabled", async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(
      <Button disabled onClick={handleClick}>
        Disabled
      </Button>
    );
    await user.click(screen.getByRole("button", { name: "Disabled" }));

    expect(handleClick).not.toHaveBeenCalled();
  });

  it("renders all variants without throwing", () => {
    const variants = ["default", "destructive", "outline", "secondary", "ghost", "link"] as const;

    for (const variant of variants) {
      const { unmount } = render(<Button variant={variant}>{variant}</Button>);
      expect(screen.getByRole("button", { name: variant })).toBeInTheDocument();
      unmount();
    }
  });
});

// ── Input ─────────────────────────────────────────────────────────────────────

describe("Input", () => {
  it("renders an input element", () => {
    render(<Input aria-label="Email address" />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("has accessible label when associated with <label>", () => {
    render(
      <>
        <label htmlFor="email-input">Email</label>
        <Input id="email-input" type="email" />
      </>
    );
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("has correct type attribute", () => {
    const { rerender } = render(<Input type="email" aria-label="Email" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("type", "email");

    rerender(<Input type="text" aria-label="Name" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("type", "text");
  });

  it("has accessible label via aria-label", () => {
    render(<Input aria-label="Search query" />);
    expect(screen.getByLabelText("Search query")).toBeInTheDocument();
  });

  it("forwards placeholder", () => {
    render(<Input placeholder="you@example.com" aria-label="Email" />);
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
  });

  it("is disabled when disabled prop is set", () => {
    render(<Input disabled aria-label="Disabled field" />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});

// ── Badge ─────────────────────────────────────────────────────────────────────

describe("Badge", () => {
  it("renders with visible text content", () => {
    render(<Badge>New</Badge>);
    expect(screen.getByText("New")).toBeVisible();
  });

  it("renders all variants without throwing", () => {
    const variants = ["default", "secondary", "outline", "destructive"] as const;

    for (const variant of variants) {
      const { unmount } = render(<Badge variant={variant}>{variant}</Badge>);
      expect(screen.getByText(variant)).toBeInTheDocument();
      unmount();
    }
  });

  it("accepts custom className", () => {
    render(<Badge className="test-class">Label</Badge>);
    const el = screen.getByText("Label");
    expect(el.className).toContain("test-class");
  });
});

// ── EmptyState ────────────────────────────────────────────────────────────────

describe("EmptyState", () => {
  it("renders with role=status", () => {
    render(<EmptyState title="No items found" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders title text", () => {
    render(<EmptyState title="No results" />);
    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(<EmptyState title="Empty" description="Start by adding your first item." />);
    expect(screen.getByText("Start by adding your first item.")).toBeInTheDocument();
  });

  it("renders action element when provided", () => {
    render(<EmptyState title="Empty" action={<button>Add item</button>} />);
    expect(screen.getByRole("button", { name: "Add item" })).toBeInTheDocument();
  });

  it("has accessible aria-label matching title", () => {
    render(<EmptyState title="No ideas yet" />);
    expect(screen.getByRole("status", { name: "No ideas yet" })).toBeInTheDocument();
  });
});

// ── Skeleton ──────────────────────────────────────────────────────────────────

describe("Skeleton", () => {
  it("renders with role=status", () => {
    render(<Skeleton />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("has default aria-label 'Loading...'", () => {
    render(<Skeleton />);
    expect(screen.getByRole("status", { name: "Loading..." })).toBeInTheDocument();
  });

  it("accepts custom aria-label", () => {
    render(<Skeleton aria-label="Loading user profile" />);
    expect(screen.getByRole("status", { name: "Loading user profile" })).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(<Skeleton className="h-4 w-32" aria-label="Loading" />);
    const el = screen.getByRole("status");
    expect(el.className).toContain("h-4");
    expect(el.className).toContain("w-32");
  });
});
