import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "@tanstack/react-router";
import { FiMoon, FiSun } from "react-icons/fi";
import { setSessionExpiredRedirect } from "./lib/session";
import {
  applyTheme,
  getInitialTheme,
  persistTheme,
  type Theme,
} from "./lib/theme";
import { FOCUS_RING_PAGE } from "./shared-components/surface";
import { TopBarNav } from "./shared-components/top-bar-nav";

function App() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());
  const navigate = useNavigate();

  // The 401 interceptor clears the stores and calls whatever is registered
  // here, so an expired session routes client-side instead of hard-reloading.
  useEffect(
    () => setSessionExpiredRedirect(() => void navigate({ to: "/" })),
    [navigate],
  );

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    applyTheme(nextTheme);
    persistTheme(nextTheme);
  };

  return (
    <div className="relative min-h-screen bg-zinc-100 text-zinc-900 transition-colors dark:bg-zinc-950 dark:text-zinc-100">
      <TopBarNav />
      {/*
       * Top-right on every breakpoint. Below `sm` this used to be
       * `fixed bottom-4 left-1/2`, parking it on top of the last row of content
       * on every page — including the Save/Publish row of open dialogs. `z-40`
       * (not 50) keeps it under the Radix dialog overlay, so it can never
       * cover a dialog's own controls either. The nav reserves `pr-28` so it
       * never collides with the hamburger.
       */}
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        className={`fixed right-4 top-3 z-40 inline-flex h-9 w-20 cursor-pointer items-center rounded-full border border-zinc-300 bg-white/95 px-1 shadow-lg backdrop-blur transition hover:shadow-xl dark:border-zinc-700 dark:bg-zinc-900/90 ${FOCUS_RING_PAGE}`}
      >
        <span className="pointer-events-none absolute left-3 text-amber-500 dark:text-zinc-500">
          <FiSun className="h-4 w-4" />
        </span>
        <span className="pointer-events-none absolute right-3 text-zinc-500 dark:text-indigo-300">
          <FiMoon className="h-4 w-4" />
        </span>
        <span
          className={`inline-flex h-7 w-7 items-center justify-center rounded-full bg-violet-700 text-white transition-transform duration-200 dark:bg-violet-500 ${theme === "dark" ? "translate-x-[2.75rem]" : "translate-x-0"}`}
        >
          {theme === "dark" ? (
            <FiMoon className="h-4 w-4" />
          ) : (
            <FiSun className="h-4 w-4" />
          )}
        </span>
      </button>
      <Outlet />
    </div>
  );
}

export default App;
