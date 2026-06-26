import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";

import "../globals.css";

export const metadata: Metadata = {
  title: "LaunchPad Portal",
  description: "AppliCAD Launch PAD Portal — AI-powered idea submission and review",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Enable static rendering for pages that use next-intl
  setRequestLocale(locale);

  // Fetch messages on the server and pass them to the client provider
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-black"
        >
          Skip to main content
        </a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <main id="main-content">{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
