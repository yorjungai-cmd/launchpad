/**
 * Custom render utility wrapping RTL's render with global providers.
 * Extend this as more providers are added (tRPC, i18n, etc.).
 */
import { type RenderOptions, render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

interface AllProvidersProps {
  children: ReactNode;
}

/**
 * Wrap with all global providers required for testing.
 * Add more providers here as the app grows (tRPC, i18n, etc.).
 */
function AllProviders({ children }: AllProvidersProps) {
  return <>{children}</>;
}

function customRender(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return render(ui, { wrapper: AllProviders, ...options });
}

// Re-export everything from RTL for convenience
export * from "@testing-library/react";
export { customRender as render };
