/**
 * Vitest global setup file.
 * Loaded before each test file via vitest.config.ts → test.setupFiles
 */
import "@testing-library/jest-dom";

// Mock Next.js router
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

// Mock next/headers (Server Components) — safe no-op in jsdom
vi.mock("next/headers", () => ({
  cookies: () => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  }),
  headers: () => new Headers(),
}));

// Suppress specific console.error noise in tests
const originalError = console.error.bind(console);
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    const msg = typeof args[0] === "string" ? args[0] : "";
    // Suppress act() warnings and React hydration warnings in tests
    if (msg.includes("Warning:") || msg.includes("act(")) return;
    originalError(...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
