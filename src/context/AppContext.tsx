import { createContext, useContext, type ReactNode } from "react";
import type { AppServices } from "../composition";

const AppContext = createContext<AppServices | null>(null);

export function AppProvider({ services, children }: { services: AppServices; children: ReactNode }) {
  return <AppContext.Provider value={services}>{children}</AppContext.Provider>;
}

export function useApp(): AppServices {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
