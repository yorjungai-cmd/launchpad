/**
 * compose — template + data → markdown content.
 * Pure function, Node + Deno safe (no runtime-specific imports).
 *
 * For each template section:
 *   - If needsNarrative=false: call placeholderFn(data) → deterministic markdown
 *   - If needsNarrative=true: return empty string (caller fills with Claude narrative)
 *
 * Ref: design/components.md — DocumentGenerationService (shared core)
 * Task 5.1
 */

import type {
  DocumentTemplate,
  TemplateData,
} from "@/modules/document-generation/templates/document-templates";

export interface ComposedSection {
  key: string;
  order: number;
  title: string;
  contentMarkdown: string;
  needsNarrative: boolean;
  sourceRef: string | null;
}

/**
 * Build the structured sections from a template + data.
 * Returns sections with deterministic content filled.
 * Narrative sections have empty contentMarkdown — caller fills them.
 */
export function composeSections(template: DocumentTemplate, data: TemplateData): ComposedSection[] {
  return template.sections
    .sort((a, b) => a.order - b.order)
    .map((section) => ({
      key: section.key,
      order: section.order,
      title: section.titleKey, // resolved to string at render time via i18n
      contentMarkdown: section.needsNarrative
        ? "" // narrative slot — filled by Claude
        : (section.placeholderFn?.(data) ?? ""),
      needsNarrative: section.needsNarrative,
      sourceRef: section.sourceRef ?? null,
    }));
}

/**
 * Assemble sections into a single markdown string.
 * Skips empty sections (narrative not yet filled).
 */
export function assembleMarkdown(sections: ComposedSection[]): string {
  return sections
    .sort((a, b) => a.order - b.order)
    .map((s) => {
      const heading = `## ${s.title}`;
      const body = s.contentMarkdown.trim();
      return body ? `${heading}\n\n${body}` : heading;
    })
    .join("\n\n");
}

/**
 * Fill narrative sections from Claude output.
 * Returns new sections array with narrative content merged in.
 */
export function fillNarrativeSections(
  sections: ComposedSection[],
  narratives: Record<string, string>
): ComposedSection[] {
  return sections.map((s) =>
    s.needsNarrative && narratives[s.key] ? { ...s, contentMarkdown: narratives[s.key]! } : s
  );
}
