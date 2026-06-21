"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import Confetti from "@/components/Confetti";

type ChecklistApi = {
  register: (id: string, done: boolean) => void;
  unregister: (id: string) => void;
  report: (id: string, done: boolean) => void;
};

const Ctx = createContext<ChecklistApi | null>(null);
export const useChecklist = () => useContext(Ctx);

// Wraps the "This month" list. The first time the user crosses an item off this
// visit, we fire a single confetti burst (not again, and never on un-checking or
// on load).
export default function ChecklistProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const celebrated = useRef(false);
  const [burst, setBurst] = useState(0);

  // register/unregister are no-ops now (kept so items don't need to change).
  const register = useCallback(() => {}, []);
  const unregister = useCallback(() => {}, []);

  const report = useCallback((_id: string, done: boolean) => {
    if (done && !celebrated.current) {
      celebrated.current = true;
      setBurst((b) => b + 1);
    }
  }, []);

  return (
    <Ctx.Provider value={{ register, unregister, report }}>
      {burst > 0 && <Confetti key={burst} />}
      {children}
    </Ctx.Provider>
  );
}
