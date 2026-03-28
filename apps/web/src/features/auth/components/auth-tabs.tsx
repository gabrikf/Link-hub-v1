import { AUTH_TABS } from "../constants/auth-tabs";
import type { AuthTab } from "../types/auth-tab";

type AuthTabsProps = {
  activeTab: AuthTab;
  onTabChange: (tab: AuthTab) => void;
};

export function AuthTabs({ activeTab, onTabChange }: AuthTabsProps) {
  return (
    <div className="grid grid-cols-2 rounded-lg border border-zinc-200 p-1 text-sm">
      {AUTH_TABS.map((tab) => {
        const isActive = activeTab === tab;

        return (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            className={`rounded-md px-3 py-2 ${isActive ? "bg-zinc-900 text-white" : "text-zinc-600 cursor-pointer"}`}
          >
            {tab === "login" ? "Login" : "Register"}
          </button>
        );
      })}
    </div>
  );
}
