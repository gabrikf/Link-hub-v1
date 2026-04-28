import { useState } from "react";
import { Outlet } from "@tanstack/react-router";
import { FiMoon, FiSun } from "react-icons/fi";
import {
  applyTheme,
  getInitialTheme,
  persistTheme,
  type Theme,
} from "./lib/theme";
import { TopBarNav } from "./shared-components/top-bar-nav";

function App() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    applyTheme(nextTheme);
    persistTheme(nextTheme);
  };

  return (
    <div className="relative min-h-screen bg-zinc-100 text-zinc-900 transition-colors dark:bg-zinc-950 dark:text-zinc-100">
      <TopBarNav />
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        className="fixed bottom-4 left-1/2 z-50 inline-flex h-10 w-20 -translate-x-1/2 cursor-pointer items-center rounded-full border border-zinc-300 bg-white/95 px-1 shadow-lg backdrop-blur transition hover:shadow-xl dark:border-zinc-700 dark:bg-zinc-900/90 sm:top-4 sm:right-4 sm:bottom-auto sm:left-auto sm:h-11 sm:w-24 sm:translate-x-0"
      >
        <span className="pointer-events-none absolute left-3 text-amber-500 dark:text-zinc-500">
          <FiSun className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </span>
        <span className="pointer-events-none absolute right-3 text-zinc-500 dark:text-indigo-300">
          <FiMoon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </span>
        <span
          className={`inline-flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-white transition-transform duration-200 dark:bg-zinc-100 dark:text-zinc-900 sm:h-9 sm:w-9 ${theme === "dark" ? "translate-x-[2.75rem] sm:translate-x-[3.25rem]" : "translate-x-0"}`}
        >
          {theme === "dark" ? (
            <FiMoon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          ) : (
            <FiSun className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          )}
        </span>
      </button>
      <Outlet />
    </div>
  );
}

export default App;
