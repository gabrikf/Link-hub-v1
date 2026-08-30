import { beforeEach, describe, expect, it } from "vitest";
import { useUserInfoStore } from "./user-info-store";

/**
 * The store holds WHO IS SIGNED IN, and until this file existed it was
 * write-once: `setUserInfo` ran at sign-in and at nothing else. Every fact in
 * it — the handle above all — was therefore a snapshot of the moment the
 * session was created, kept in `localStorage` and trusted forever.
 *
 * `syncUserInfo` is the reconciliation the store was missing. See
 * `app-boot.ts` (which feeds it the `/me` answer on every load) and the
 * profile-save mutation in `dashboard-page.tsx` (which feeds it the new
 * handle the instant it is saved).
 */
const signedInAs = (login: string) =>
  useUserInfoStore.setState({
    userInfo: {
      id: "user-1",
      email: "ada@example.com",
      login,
      name: "Ada Lovelace",
      description: null,
      avatarUrl: null,
      googleId: null,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

beforeEach(() => {
  useUserInfoStore.setState({ userInfo: null });
});

describe("useUserInfoStore.syncUserInfo", () => {
  it("adopts the server's current handle, name and avatar", () => {
    signedInAs("ada");

    useUserInfoStore.getState().syncUserInfo({
      username: "ada-lovelace",
      name: "Ada L.",
      userPhoto: "https://example.com/ada.png",
    });

    const userInfo = useUserInfoStore.getState().userInfo;
    expect(userInfo?.login).toBe("ada-lovelace");
    expect(userInfo?.name).toBe("Ada L.");
    expect(userInfo?.avatarUrl).toBe("https://example.com/ada.png");
  });

  it("keeps the identity fields the server profile does not carry", () => {
    signedInAs("ada");

    useUserInfoStore.getState().syncUserInfo({
      username: "ada-lovelace",
      name: "Ada L.",
      userPhoto: null,
    });

    // `/me` answers with `profileSchema`, which has no id and no email. A sync
    // that rebuilt the object from the profile alone would silently drop the
    // two fields the rest of the app identifies the account by.
    const userInfo = useUserInfoStore.getState().userInfo;
    expect(userInfo?.id).toBe("user-1");
    expect(userInfo?.email).toBe("ada@example.com");
  });

  it("does nothing when nobody is signed in", () => {
    useUserInfoStore.getState().syncUserInfo({
      username: "ada",
      name: "Ada Lovelace",
      userPhoto: null,
    });

    // Reconciling is not signing in. `hasStoredSession()` reads this field to
    // decide whether there is a session at all, so writing a profile into an
    // empty store would mint half a session out of a plain profile read.
    expect(useUserInfoStore.getState().userInfo).toBeNull();
  });
});
