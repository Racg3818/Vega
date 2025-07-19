// components/Layout.tsx
import { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-vega-background text-vega-text">
      {children}
    </div>
  );
}
