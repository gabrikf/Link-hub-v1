import type { DigestCadence } from "@repo/schemas";
import { describe, expect, it } from "vitest";
import { GitConnectionEntity } from "../../../entity/git-connection/git-connection-entity.js";
import { countMonthsInWindow, countWeeksInWindow } from "./activity-buckets.js";
import {
  buildDigestKey,
  MAX_DIGEST_WINDOW_DAYS,
  RECENT_WINDOW_WEEKS,
  resolveDigestPreviewWindow,
  resolveDigestWindow,
  resolveRecentWindow,
  resolveTrackRecordWindow,
  TRACK_RECORD_MONTHS,
} from "./digest-window.js";

const NOW = new Date("2026-08-14T09:00:00.000Z");

function makeConnection(
  cadence: DigestCadence,
  lastDigestAt: Date | null,
): GitConnectionEntity {
  return GitConnectionEntity.create({
    userId: "user-1",
    provider: "github",
    kind: "personal",
    displayName: "Personal GitHub",
    externalAccountId: "gh-1",
    workExperienceId: null,
    disclosureLevelOverride: null,
    webhookSecret: null,
    autoPostEnabled: true,
    cadence,
    includeAgentSummary: false,
    lastDigestAt,
  });
}

describe("resolveDigestWindow — first run", () => {
  it.each([
    ["weekly", "2026-08-08"],
    ["biweekly", "2026-08-01"],
    ["monthly", "2026-07-15"],
  ] as const)(
    "covers one %s period ending today",
    (cadence, expectedFrom) => {
      expect(resolveDigestWindow(makeConnection(cadence, null), NOW)).toEqual({
        from: expectedFrom,
        to: "2026-08-14",
      });
    },
  );
});

describe("resolveDigestWindow — subsequent runs", () => {
  it("opens the day AFTER the last digest, so no event is counted twice", () => {
    const connection = makeConnection(
      "weekly",
      new Date("2026-08-07T09:00:00.000Z"),
    );

    // 08-07 was covered by the previous post. Two posts describing overlapping
    // sets of merges would each be individually indefensible.
    expect(resolveDigestWindow(connection, NOW)).toEqual({
      from: "2026-08-08",
      to: "2026-08-14",
    });
  });

  it("reads the last digest in UTC rather than local time", () => {
    const connection = makeConnection(
      "weekly",
      new Date("2026-08-13T23:45:00.000Z"),
    );

    expect(resolveDigestWindow(connection, NOW).from).toBe("2026-08-14");
  });

  it("caps a long silence at a quarter rather than back-filling a year", () => {
    const connection = makeConnection(
      "weekly",
      new Date("2025-08-14T09:00:00.000Z"),
    );

    const window = resolveDigestWindow(connection, NOW);

    // A "weekly" post summarising twelve months would publish wildly inflated
    // numbers under a weekly headline.
    expect(window).toEqual({ from: "2026-05-15", to: "2026-08-14" });
    expect(
      Math.round(
        (Date.parse(`${window.to}T00:00:00Z`) -
          Date.parse(`${window.from}T00:00:00Z`)) /
          86_400_000,
      ) + 1,
    ).toBe(MAX_DIGEST_WINDOW_DAYS);
  });

  it("produces an inverted window when nothing new has happened yet", () => {
    // Digested today, asked again today. The generator reads this as "no
    // events" and posts nothing, rather than re-digesting the same day.
    const connection = makeConnection("weekly", NOW);

    const window = resolveDigestWindow(connection, NOW);

    expect(window.from > window.to).toBe(true);
  });
});

describe("resolveDigestPreviewWindow", () => {
  it.each([
    ["weekly", "2026-08-08"],
    ["biweekly", "2026-08-01"],
    ["monthly", "2026-07-15"],
  ] as const)("covers one trailing %s period ending today", (cadence, from) => {
    expect(resolveDigestPreviewWindow(makeConnection(cadence, null), NOW)).toEqual(
      { from, to: "2026-08-14" },
    );
  });

  it("ignores lastDigestAt — a preview shows a typical period, not the next stub", () => {
    // Digested this morning: the REAL next window would be inverted and empty,
    // which previews as "you have no activity" the moment a digest runs.
    const connection = makeConnection("weekly", NOW);

    expect(resolveDigestPreviewWindow(connection, NOW)).toEqual({
      from: "2026-08-08",
      to: "2026-08-14",
    });
  });

  it("previews an 'off' connection over a weekly window", () => {
    // The user previewing a muted connection is deciding whether to unmute it,
    // and weekly is the default cadence they would get.
    expect(resolveDigestPreviewWindow(makeConnection("off", null), NOW)).toEqual({
      from: "2026-08-08",
      to: "2026-08-14",
    });
  });
});

describe("resolveTrackRecordWindow", () => {
  it("looks back exactly 48 calendar months from the digest window's end", () => {
    const window = resolveTrackRecordWindow({
      from: "2026-08-08",
      to: "2026-08-14",
    });

    // Aligned to the first of a month, so the window covers exactly 48 WHOLE
    // calendar months. Starting mid-month would touch 49 of them and the claim
    // would read "of the last 49 months" while meaning four years.
    expect(window).toEqual({ from: "2022-09-01", to: "2026-08-14" });
    expect(countMonthsInWindow(window.from, window.to)).toBe(TRACK_RECORD_MONTHS);
  });
});

describe("resolveRecentWindow", () => {
  it("covers exactly 13 ISO weeks, whatever weekday the window ends on", () => {
    for (const to of ["2026-08-10", "2026-08-14", "2026-08-16", "2026-08-17"]) {
      const window = resolveRecentWindow({ from: to, to });

      // Unaligned, a 13 * 7 day window starting mid-week touches fourteen ISO
      // weeks, and "11 of the last 13" would silently become "of the last 14".
      expect(countWeeksInWindow(window.from, window.to)).toBe(
        RECENT_WINDOW_WEEKS,
      );
    }
  });
});

describe("buildDigestKey", () => {
  it("is stable for the same connection and window, and different for another window", () => {
    const first = buildDigestKey("connection-1", {
      from: "2026-08-08",
      to: "2026-08-14",
    });

    expect(
      buildDigestKey("connection-1", { from: "2026-08-08", to: "2026-08-14" }),
    ).toBe(first);
    expect(
      buildDigestKey("connection-1", { from: "2026-08-15", to: "2026-08-21" }),
    ).not.toBe(first);
    expect(
      buildDigestKey("connection-2", { from: "2026-08-08", to: "2026-08-14" }),
    ).not.toBe(first);
  });
});
