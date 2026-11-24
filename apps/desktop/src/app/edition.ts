import { useEffect } from "react";
import { create } from "zustand";

export type Edition = "day" | "night";
export type EditionChoice = Edition | "system";

type EditionState = {
  choice: EditionChoice;
  setChoice: (choice: EditionChoice) => void;
};

/** Day or Night edition. Persistence moves to SQLite settings in M2; until then it follows the session. */
export const useEditionStore = create<EditionState>((set) => ({
  choice: "system",
  setChoice: (choice) => set({ choice }),
}));

const query = "(prefers-color-scheme: dark)";

function systemEdition(): Edition {
  return window.matchMedia(query).matches ? "night" : "day";
}

/** The edition currently printed. */
export function useEdition(): Edition {
  const choice = useEditionStore((s) => s.choice);
  return choice === "system" ? systemEdition() : choice;
}

/** Keeps <html data-edition> in step with the choice and with the system setting. */
export function useApplyEdition(): void {
  const choice = useEditionStore((s) => s.choice);
  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.edition = choice === "system" ? systemEdition() : choice;
    };
    apply();
    const mq = window.matchMedia(query);
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [choice]);
}
