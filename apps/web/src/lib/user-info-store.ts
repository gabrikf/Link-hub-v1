import type { LoginOutput } from "@repo/schemas";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type UserInfo = LoginOutput["user"];

type UserInfoState = {
  userInfo: UserInfo | null;
  setUserInfo: (userInfo: UserInfo) => void;
  clearUserInfo: () => void;
};

const USER_INFO_STORAGE_KEY = "linkhub.auth.user-info";

export const useUserInfoStore = create<UserInfoState>()(
  persist(
    (set) => ({
      userInfo: null,
      setUserInfo: (userInfo) => set({ userInfo }),
      clearUserInfo: () => set({ userInfo: null }),
    }),
    {
      name: USER_INFO_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
