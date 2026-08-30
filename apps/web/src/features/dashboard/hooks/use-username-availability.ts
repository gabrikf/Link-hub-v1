import type { UsernameAvailability } from "@repo/schemas";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { fetchUsernameAvailability } from "../../../lib/auth-api";

/**
 * How long the field has to stop changing before the api is asked.
 *
 * A request per keystroke would put ~12 of them behind "marianamanfrin" and
 * paint a verdict for every prefix along the way — `m` is taken, `ma` is free —
 * which is noise, not feedback. 400ms is past a touch-typist's inter-key gap
 * and short enough that the answer feels attached to the typing.
 */
const DEBOUNCE_MS = 400;

export type UsernameStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available" }
  | { kind: "taken" }
  | { kind: "reserved" }
  | { kind: "unknown" };

/**
 * The availability of the handle currently in the field.
 *
 * THE UNCHANGED VALUE IS NOT CHECKED. `currentUsername` is what the account
 * already owns; asking about it would spend a request to be told what is
 * already true, and any hiccup in that request would decorate an untouched form
 * with a warning. It reports `idle`, and the api's viewer-aware answer is the
 * belt to this hook's braces.
 *
 * A FAILED CHECK IS `unknown`, NEVER `available`. The check is advice — the
 * save is the only authority — but advice that invents a "free" out of a 500
 * would send the user confidently into a 409.
 */
export function useUsernameAvailability(
  username: string,
  currentUsername: string | undefined,
): UsernameStatus {
  const trimmed = username.trim();
  const [debounced, setDebounced] = useState(trimmed);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed]);

  const isWorthChecking =
    debounced.length > 0 && debounced !== (currentUsername ?? "").trim();

  const query = useQuery<UsernameAvailability>({
    queryKey: ["username-available", debounced],
    enabled: isWorthChecking,
    // The answer is a fact about the world at that instant, and the person is
    // watching for it — a cached verdict from five minutes ago is worse than
    // the round trip.
    staleTime: 0,
    retry: false,
    queryFn: () => fetchUsernameAvailability(debounced),
  });

  if (!isWorthChecking) {
    return { kind: "idle" };
  }

  /*
   * `debounced !== trimmed` is the still-typing window: the timer has not
   * fired, so any settled answer below belongs to a handle the field no longer
   * holds. Showing it would flash a verdict about the previous keystroke.
   */
  if (debounced !== trimmed || query.isPending || query.isFetching) {
    return { kind: "checking" };
  }

  if (query.isError || !query.data) {
    return { kind: "unknown" };
  }

  if (query.data.isAvailable) {
    return { kind: "available" };
  }

  return { kind: query.data.reason === "reserved" ? "reserved" : "taken" };
}
