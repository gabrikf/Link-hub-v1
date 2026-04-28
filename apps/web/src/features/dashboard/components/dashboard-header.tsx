import { FiLayout } from "react-icons/fi";

export function DashboardHeader() {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-2 items-center">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-linear-to-br from-cyan-500 to-blue-500 text-white shadow-sm">
          <FiLayout className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="flex flex-col">
          <h1 className="flex items-center gap-1 text-lg font-semibold">
            Dashboard
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Manage your link collection.
          </p>
        </div>
      </div>
    </header>
  );
}
