"use client";

import { createContext, useCallback, useContext } from "react";

type ChecklistApi = {
  register: (id: string, done: boolean) => void;
  unregister: (id: string) => void;
  report: (id: string, done: boolean) => void;
};

const Ctx = createContext<ChecklistApi | null>(null);
export const useChecklist = () => useContext(Ctx);

// Wraps the "This month" list. register/unregister/report are no-ops now
// (kept so items don't need to change); this used to fire a confetti burst
// on the first item checked off, which has been removed.
export default function ChecklistProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const register = useCallback(() => {}, []);
  const unregister = useCallback(() => {}, []);
  const report = useCallback(() => {}, []);

  return (
    <Ctx.Provider value={{ register, unregister, report }}>
      {children}
    </Ctx.Provider>
  );
}
