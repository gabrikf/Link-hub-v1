import { describe, expect, it } from "vitest";
import { ActivityEventEntity } from "../../../entity/activity-event/activity-event-entity.js";
import {
  addDays,
  addMonths,
  countDaysInWindow,
  countMonthsInWindow,
  countWeeksInWindow,
  enumerateMonths,
  enumerateWeeks,
  isoWeekBucket,
  monthBucket,
  toDateString,
} from "./activity-buckets.js";

function eventOn(occurredOn: string): ActivityEventEntity {
  return ActivityEventEntity.create({
    userId: "user-1",
    connectionId: "connection-1",
    source: "github",
    externalDeliveryId: `delivery-${occurredOn}`,
    kind: "commit",
    occurredOn,
    repoFingerprint: "a".repeat(64),
    technologies: [],
    actorIsOwner: true,
    counterpartyFingerprints: [],
    payload: null,
  });
}

describe("isoWeekBucket", () => {
  /**
   * The whole reason this function is a standalone copy of the entity's
   * `weekBucket()` is that windows have boundaries with no event behind them.
   * This test is what stops the copy from drifting: the dates chosen are the
   * ones ISO week numbering actually gets wrong if you take the year from the
   * date instead of from the Thursday of its week.
   */
  it.each([
    "2024-12-30", // Monday of ISO week 2025-W01, in calendar year 2024
    "2025-01-01",
    "2025-12-28", // Sunday of ISO week 2025-W52
    "2025-12-29", // Monday of ISO week 2026-W01, in calendar year 2025
    "2026-01-04",
    "2026-08-14",
    "2020-02-29",
  ])("agrees with ActivityEventEntity.weekBucket() for %s", (date) => {
    expect(isoWeekBucket(date)).toBe(eventOn(date).weekBucket());
  });

  it("puts a Monday and the following Sunday in the same ISO week", () => {
    expect(isoWeekBucket("2026-08-10")).toBe(isoWeekBucket("2026-08-16"));
    expect(isoWeekBucket("2026-08-16")).not.toBe(isoWeekBucket("2026-08-17"));
  });
});

describe("monthBucket", () => {
  it("agrees with the entity", () => {
    expect(monthBucket("2026-08-14")).toBe(eventOn("2026-08-14").monthBucket());
  });
});

describe("day and month arithmetic", () => {
  it("crosses a month boundary", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("crosses a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("clamps a month shift to the last day of the target month", () => {
    // `setMonth` alone would roll this into March, which would make "one month
    // back from March 31" land inside March.
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2028-03-31", -1)).toBe("2028-02-29");
    expect(addMonths("2026-01-15", -48)).toBe("2022-01-15");
  });

  it("reads an instant in UTC, never in local time", () => {
    // A local-time reading would return the previous day west of Greenwich and
    // silently shift every window by one day depending on where the worker runs.
    expect(toDateString(new Date("2026-08-14T23:30:00.000Z"))).toBe("2026-08-14");
    expect(toDateString(new Date("2026-08-15T00:30:00.000Z"))).toBe("2026-08-15");
  });
});

describe("window sizing", () => {
  it("counts inclusive days", () => {
    expect(countDaysInWindow("2026-08-08", "2026-08-14")).toBe(7);
    expect(countDaysInWindow("2026-08-14", "2026-08-14")).toBe(1);
  });

  it("returns nothing for an inverted window", () => {
    expect(countDaysInWindow("2026-08-14", "2026-08-08")).toBe(0);
    expect(countMonthsInWindow("2026-08-14", "2026-08-08")).toBe(0);
    expect(countWeeksInWindow("2026-08-14", "2026-08-08")).toBe(0);
    expect(enumerateMonths("2026-08-14", "2026-08-08")).toEqual([]);
    expect(enumerateWeeks("2026-08-14", "2026-08-08")).toEqual([]);
  });

  it("counts months the window touches, including partial ones at each end", () => {
    expect(countMonthsInWindow("2026-01-31", "2026-03-01")).toBe(3);
    expect(countMonthsInWindow("2026-08-01", "2026-08-31")).toBe(1);
    // The denominator of "43 of the last 48 months".
    expect(countMonthsInWindow("2022-09-15", "2026-08-14")).toBe(48);
  });

  it("counts ISO weeks by enumeration, not by dividing days by seven", () => {
    // Sunday to Monday: two days, two ISO weeks. `ceil(2 / 7)` says one.
    expect(countWeeksInWindow("2026-08-16", "2026-08-17")).toBe(2);
    // Wednesday to Friday, 87 days later: a 5-day partial week at each end and
    // 11 whole weeks between them. `ceil(87 / 7)` says 13 here by luck, but
    // shifting the start to a Sunday makes it 14 while the day count is
    // unchanged — which is why this is enumerated.
    expect(countWeeksInWindow("2026-05-20", "2026-08-14")).toBe(13);
    expect(countWeeksInWindow("2026-05-24", "2026-08-18")).toBe(14);
  });

  it("enumerates months in chronological order across a year boundary", () => {
    expect(enumerateMonths("2025-11-30", "2026-02-01")).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });
});
