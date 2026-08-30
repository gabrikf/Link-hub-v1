import type { LoginOutput } from "@repo/schemas";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type UserInfo = LoginOutput["user"];

/**
 * The subset of a profile response that also describes the SIGNED-IN user.
 *
 * Structural rather than named after one endpoint on purpose: `GET /me`
 * (`profileSchema`) and `PUT /profile` (`updateProfileSchemaOutput`) both
 * satisfy it, and both are places where these three facts can have moved since
 * the session was created.
 */
type SyncableProfileFacts = {
  username: string;
  name: string;
  userPhoto: string | null;
};

type UserInfoState = {
  userInfo: UserInfo | null;
  setUserInfo: (userInfo: UserInfo) => void;
  syncUserInfo: (profile: SyncableProfileFacts) => void;
  clearUserInfo: () => void;
};

const USER_INFO_STORAGE_KEY = "crafthub.auth.user-info";

export const useUserInfoStore = create<UserInfoState>()(
  persist(
    (set) => ({
      userInfo: null,
      setUserInfo: (userInfo) => set({ userInfo }),
      /**
       * Reconcile the stored identity with what the server says it is NOW.
       *
       * This store is persisted, and until this action existed its only writer
       * was `setUserInfo` at sign-in. Everything in it was therefore a snapshot
       * of the account as it was on the day this device signed in — and one of
       * those facts, `login`, is a URL. `TopBarNav` renders the "Public
       * profile" item as `to="/$username"` with `params: { username:
       * userInfo.login }`, so once the owner renamed their handle the link
       * pointed at a username nobody owns: the api answered 404 and the owner
       * was shown the public profile's "Profile not found" state on what should
       * have been their own page — on every device that had not signed out
       * since, forever, because nothing else ever rewrote the snapshot.
       *
       * `name` rides along because the mobile menu's identity block renders it
       * and it goes stale in exactly the same way — silently, and only on the
       * screen that tells you which account you are in. `avatarUrl` has no
       * reader today (the drawer shows text, not a photo); it is here so the
       * stored identity cannot hold a THIRD state — neither the sign-in
       * snapshot nor the server's answer — the day something does read it.
       *
       * NOT A SIGN-IN. When there is no session there is nothing to reconcile:
       * `hasStoredSession()` treats a present `userInfo` as half the evidence
       * that somebody is signed in, so writing one here would mint half a
       * session out of a profile read.
       */
      syncUserInfo: (profile) =>
        set((state) =>
          state.userInfo
            ? {
                userInfo: {
                  ...state.userInfo,
                  login: profile.username,
                  name: profile.name,
                  avatarUrl: profile.userPhoto,
                },
              }
            : state,
        ),
      clearUserInfo: () => set({ userInfo: null }),
    }),
    {
      name: USER_INFO_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
