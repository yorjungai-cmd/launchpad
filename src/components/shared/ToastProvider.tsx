"use client";

import { Toaster, toast as sonnerToast } from "sonner";

/**
 * Sonner toast provider.
 *
 * Mount this once near the root of your application (e.g. in the root layout):
 * ```tsx
 * // app/[locale]/layout.tsx
 * import { ToastProvider } from '@/components/shared';
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         {children}
 *         <ToastProvider />
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      duration={4000}
      toastOptions={{
        classNames: {
          toast: "font-sans text-sm",
        },
      }}
    />
  );
}

// ── useToast convenience hook ────────────────────────────────────────────────

export interface ToastOptions {
  description?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Thin wrapper around Sonner's imperative API.
 *
 * Usage:
 * ```ts
 * const toast = useToast();
 * toast.success('Idea submitted successfully');
 * toast.error('Something went wrong', { description: err.message });
 * ```
 */
export function useToast() {
  return {
    success(message: string, options?: ToastOptions) {
      sonnerToast.success(message, options);
    },
    error(message: string, options?: ToastOptions) {
      sonnerToast.error(message, options);
    },
    info(message: string, options?: ToastOptions) {
      sonnerToast.info(message, options);
    },
    warning(message: string, options?: ToastOptions) {
      sonnerToast.warning(message, options);
    },
    loading(message: string, options?: Omit<ToastOptions, "action">) {
      return sonnerToast.loading(message, options);
    },
    dismiss(toastId?: string | number) {
      sonnerToast.dismiss(toastId);
    },
    promise<T>(promise: Promise<T>, messages: { loading: string; success: string; error: string }) {
      return sonnerToast.promise(promise, messages);
    },
  };
}

export default ToastProvider;
