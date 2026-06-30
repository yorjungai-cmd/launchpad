/**
 * Task 6 — DocTypeNav component tests
 *
 * Verifies:
 * 1. All 11 document types render (plus the "System Prompt" global item)
 * 2. Clicking a document type calls onSelect with the correct type key
 * 3. The active item has aria-selected="true" on its <li role="option">
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

import { DocTypeNav } from "@/components/settings/prompt-config/DocTypeNav";
import { DOCUMENT_TYPES_IN_WORKFLOW_ORDER } from "@/lib/document-generation/prompt-config-defaults";

// ── 1. All 11 document types render ──────────────────────────────────────────

describe("DocTypeNav", () => {
  it("renders all 11 document type labels", () => {
    render(<DocTypeNav selected="global" dirtyTypes={new Set()} onSelect={vi.fn()} />);

    for (const { label } of DOCUMENT_TYPES_IN_WORKFLOW_ORDER) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('renders the "System Prompt" global item', () => {
    render(<DocTypeNav selected="global" dirtyTypes={new Set()} onSelect={vi.fn()} />);

    expect(screen.getByText("System Prompt")).toBeInTheDocument();
  });

  // ── 2. Click calls onSelect with correct type ──────────────────────────────

  it("calls onSelect with the document type key when a type button is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(<DocTypeNav selected="global" dirtyTypes={new Set()} onSelect={onSelect} />);

    // Click the first document type
    const firstType = DOCUMENT_TYPES_IN_WORKFLOW_ORDER[0];
    await user.click(screen.getByText(firstType.label));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(firstType.type);
  });

  it('calls onSelect with "global" when the System Prompt button is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(<DocTypeNav selected="feasibility_report" dirtyTypes={new Set()} onSelect={onSelect} />);

    await user.click(screen.getByText("System Prompt"));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("global");
  });

  it("calls onSelect with the clicked type's key for each document type", async () => {
    const user = userEvent.setup();

    for (const { type, label } of DOCUMENT_TYPES_IN_WORKFLOW_ORDER) {
      const onSelect = vi.fn();
      const { unmount } = render(
        <DocTypeNav selected="global" dirtyTypes={new Set()} onSelect={onSelect} />
      );

      await user.click(screen.getByText(label));
      expect(onSelect).toHaveBeenCalledWith(type);
      unmount();
    }
  });

  // ── 3. Active item has distinguishable state ───────────────────────────────

  it("marks the active document type's <li> with aria-selected=true", () => {
    const activeType = DOCUMENT_TYPES_IN_WORKFLOW_ORDER[2]; // bmc

    render(<DocTypeNav selected={activeType.type} dirtyTypes={new Set()} onSelect={vi.fn()} />);

    // Find the <li role="option"> that wraps the active button
    const options = screen.getAllByRole("option");
    const activeOption = options.find((el) => el.getAttribute("aria-selected") === "true");

    expect(activeOption).toBeDefined();
    expect(activeOption).toContainElement(screen.getByText(activeType.label));
  });

  it('marks the "global" <li> with aria-selected=true when selected="global"', () => {
    render(<DocTypeNav selected="global" dirtyTypes={new Set()} onSelect={vi.fn()} />);

    const options = screen.getAllByRole("option");
    const globalOption = options.find((el) => el.getAttribute("aria-selected") === "true");

    expect(globalOption).toBeDefined();
    expect(globalOption).toContainElement(screen.getByText("System Prompt"));
  });

  it("no document type option has aria-selected=true when global is active", () => {
    render(<DocTypeNav selected="global" dirtyTypes={new Set()} onSelect={vi.fn()} />);

    const options = screen.getAllByRole("option");
    const activeOptions = options.filter((el) => el.getAttribute("aria-selected") === "true");

    // Only the global item should be active
    expect(activeOptions).toHaveLength(1);
    expect(activeOptions[0]).toContainElement(screen.getByText("System Prompt"));
  });

  // ── Dirty indicator ────────────────────────────────────────────────────────

  it("shows dirty indicator dot for dirty types", () => {
    const dirtyType = DOCUMENT_TYPES_IN_WORKFLOW_ORDER[0];

    render(
      <DocTypeNav selected="global" dirtyTypes={new Set([dirtyType.type])} onSelect={vi.fn()} />
    );

    // The dirty indicator spans have aria-label="มีการเปลี่ยนแปลง"
    const indicators = screen.getAllByLabelText("มีการเปลี่ยนแปลง");
    expect(indicators).toHaveLength(1);
  });
});
