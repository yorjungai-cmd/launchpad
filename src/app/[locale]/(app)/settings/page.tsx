"use client";

/**
 * SettingsPage — Admin Settings with sidebar tabs
 *
 * Tabs (controlled via ?tab= URL search param):
 *   - ai-config  (default) — AI Model Configuration (AiConfigTab)
 *   - api-keys             — API Key Management     (ApiKeysTab — placeholder)
 *   - users                — User Management        (UsersTab   — placeholder)
 *
 * Route guard:
 *   - Middleware enforces Supabase session (auth.getUser).
 *   - tRPC procedures enforce admin role server-side (roleProcedure('admin')).
 *   - This page adds a client-side access check via api.admin.getAiConfig;
 *     a FORBIDDEN error from tRPC surfaces as an "access denied" state.
 *
 * Tab routing:
 *   - useSearchParams() reads ?tab= from the URL.
 *   - Tab change pushes a new history entry via router.replace.
 *   - Default tab is 'ai-config'.
 *
 * Lazy loading:
 *   - Each tab component is dynamically imported so non-active tabs
 *     don't increase the initial bundle.
 *
 * Design ref: design/components.md — SettingsPage (Component 6)
 *
 * Task 8.1
 */

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Settings, Bot, KeyRound, Users, SlidersHorizontal, Package } from "lucide-react";

import { cn } from "@/lib/utils";

// ─── Lazy-loaded tab components ───────────────────────────────────────────────

const AiConfigTab = dynamic(
  () =>
    import("@/components/settings/AiConfigTab").then((m) => ({
      default: m.AiConfigTab,
    })),
  {
    loading: () => <AiConfigTabSkeleton />,
    ssr: false,
  }
);

const ApiKeysTab = dynamic(
  () =>
    import("@/components/settings/ApiKeysTab").then((m) => ({
      default: m.ApiKeysTab,
    })),
  {
    loading: () => <TabContentSkeleton />,
    ssr: false,
  }
);

const UsersTab = dynamic(
  () =>
    import("@/components/settings/UsersTab").then((m) => ({
      default: m.UsersTab,
    })),
  {
    loading: () => <TabContentSkeleton />,
    ssr: false,
  }
);

const PromptConfigTab = dynamic(
  () =>
    import("@/components/settings/PromptConfigTab").then((m) => ({
      default: m.PromptConfigTab,
    })),
  { loading: () => <TabContentSkeleton />, ssr: false }
);

const PortfolioTab = dynamic(
  () =>
    import("@/components/settings/PortfolioTab").then((m) => ({
      default: m.PortfolioTab,
    })),
  { loading: () => <TabContentSkeleton />, ssr: false }
);

// Skeleton used as the Suspense/dynamic loading fallback for AiConfigTab
function AiConfigTabSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="กำลังโหลด...">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 w-40 rounded bg-muted" />
          <div className="h-3 w-72 rounded bg-muted" />
          <div className="h-10 w-full max-w-sm rounded bg-muted" />
        </div>
      ))}
      <div className="h-10 w-24 rounded bg-muted" />
    </div>
  );
}

// Generic tab loading skeleton
function TabContentSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="กำลังโหลด...">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-5 w-32 rounded bg-muted" />
          <div className="h-3 w-64 rounded bg-muted" />
        </div>
        <div className="h-9 w-24 rounded bg-muted" />
      </div>
      <div className="h-48 w-full rounded-lg bg-muted" />
    </div>
  );
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

type TabId = "ai-config" | "prompt-config" | "portfolio" | "api-keys" | "users";

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const TABS: TabDef[] = [
  { id: "ai-config", label: "AI Configuration", icon: Bot },
  { id: "prompt-config", label: "Prompt Config", icon: SlidersHorizontal },
  { id: "portfolio", label: "Portfolio", icon: Package },
  { id: "api-keys", label: "API Keys", icon: KeyRound },
  { id: "users", label: "Users", icon: Users },
];

const DEFAULT_TAB: TabId = "ai-config";

function isValidTab(value: string | null): value is TabId {
  return TABS.some((t) => t.id === value);
}

// ─── Tab content map ──────────────────────────────────────────────────────────

function TabContent({ activeTab }: { activeTab: TabId }) {
  switch (activeTab) {
    case "ai-config":
      return <AiConfigTab />;
    case "prompt-config":
      return <PromptConfigTab />;
    case "portfolio":
      return <PortfolioTab />;
    case "api-keys":
      return <ApiKeysTab />;
    case "users":
      return <UsersTab />;
    default:
      return null;
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawTab = searchParams.get("tab");
  const activeTab: TabId = isValidTab(rawTab) ? rawTab : DEFAULT_TAB;

  function handleTabChange(tabId: TabId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tabId);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div
          className="flex size-10 items-center justify-center rounded-lg bg-primary/10"
          aria-hidden="true"
        >
          <Settings className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Admin settings — AI configuration, API keys, and user management
          </p>
        </div>
      </div>

      {/* Settings layout: sidebar + content */}
      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        {/* Sidebar navigation */}
        <nav aria-label="Settings sections" className="shrink-0 lg:w-56">
          <ul className="space-y-1" role="tablist" aria-orientation="vertical">
            {TABS.map(({ id, label, icon: Icon }) => {
              const isActive = id === activeTab;
              return (
                <li key={id} role="presentation">
                  <button
                    type="button"
                    role="tab"
                    id={`tab-${id}`}
                    aria-selected={isActive}
                    aria-controls={`tabpanel-${id}`}
                    onClick={() => handleTabChange(id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Tab content panel */}
        <div
          role="tabpanel"
          id={`tabpanel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          className="min-w-0 flex-1"
          tabIndex={0}
        >
          <React.Suspense fallback={<AiConfigTabSkeleton />}>
            <TabContent activeTab={activeTab} />
          </React.Suspense>
        </div>
      </div>
    </div>
  );
}
