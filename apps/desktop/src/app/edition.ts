import { useEffect, useSyncExternalStore } from "react";
import { settingsDb, useSettings } from "../db/settings";

export type Edition = "day" | "night";
export type EditionChoice = Edition | "system";

type EditionState = {
  choice: EditionChoice;
  setChoice: (choice: EditionChoice) => void;
};

/** Day or Night edition, saved in the local settings (src/db/settings) and read back at start. */
export function useEditionStore<T>(select: (s: EditionState) => T): T {
  return useSettings((s) => select({ choice: s.edition, setChoice: settingsDb.setEdition }));
}

const query = "(prefers-color-scheme: dark)";

function systemEdition(): Edition {
  return window.matchMedia(query).matches ? "night" : "day";
}

function onSystemChange(notify: () => void): () => void {
  const mq = window.matchMedia(query);
  mq.addEventListener("change", notify);
  return () => mq.removeEventListener("change", notify);
}

/** The edition currently printed; follows the system setting live when the choice is "system". */
export function useEdition(): Edition {
  const choice = useSettings((s) => s.edition);
  const system = useSyncExternalStore(onSystemChange, systemEdition);
  return choice === "system" ? system : choice;
}

/** Keeps <html data-edition> in step with the choice and with the system setting. */
export function useApplyEdition(): void {
  const choice = useSettings((s) => s.edition);
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

/** Keeps <html data-board> on the chosen board theme (the tokens draw every board from it). */
export function useApplyBoardTheme(): void {
  const theme = useSettings((s) => s.boardTheme);
  useEffect(() => {
    document.documentElement.dataset.board = theme;
  }, [theme]);
}
