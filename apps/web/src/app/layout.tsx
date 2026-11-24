import type { Metadata } from "next";
import type { ReactNode } from "react";
import { apiConfig } from "../lib/api";
import "./globals.css";

export const metadata: Metadata = {
  title: "PermitGraph",
  description: "Explore access graphs from immutable snapshots",
};

// Every page reads live API data for the configured user.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  const { userId } = apiConfig();
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <a href="/" className="brand">
            PermitGraph
          </a>
          <span className="muted" data-testid="current-user">
            Viewing as <code>{userId}</code>
          </span>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
