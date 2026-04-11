import { AUTH_TABS } from "../constants/auth-tabs";
import type { AuthTab } from "../types/auth-tab";
import { Button } from "../../../shared-components/button";

type AuthTabsProps = {
  activeTab: AuthTab;
  onTabChange: (tab: AuthTab) => void;
};

export function AuthTabs({ activeTab, onTabChange }: AuthTabsProps) {
  return (
    <div className="grid grid-cols-2 rounded-lg border border-zinc-200 p-1 text-sm dark:border-zinc-700">
      {AUTH_TABS.map((tab) => {
        const isActive = activeTab === tab;

        return (
          <Button
            key={tab}
            type="button"
            variant={isActive ? "primary" : "ghost"}
            size="md"
            fullWidth
            onClick={() => onTabChange(tab)}
            className={
              isActive
                ? "rounded-md"
                : "rounded-md text-zinc-600 dark:text-zinc-300"
            }
          >
            {tab === "login" ? "Login" : "Register"}
          </Button>
        );
      })}
    </div>
  );
}
