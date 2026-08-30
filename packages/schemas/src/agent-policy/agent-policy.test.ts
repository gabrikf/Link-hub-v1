import { describe, expect, it } from "vitest";
import {
  AGENT_DISCLOSURE_BULLETS,
  AGENT_DISCLOSURE_LEVELS,
  DEFAULT_AGENT_DISCLOSURE_LEVEL,
  agentDisclosureLevelSchema,
  type AgentDisclosureBulletId,
} from "./index.js";

const BULLET_IDS = Object.keys(
  AGENT_DISCLOSURE_BULLETS,
) as AgentDisclosureBulletId[];

describe("agent disclosure levels", () => {
  it("covers every level in the enum, in order of increasing disclosure", () => {
    expect(AGENT_DISCLOSURE_LEVELS.map((level) => level.value)).toEqual(
      agentDisclosureLevelSchema.options,
    );
  });

  it("defaults to the most restrictive level", () => {
    expect(AGENT_DISCLOSURE_LEVELS[0].value).toBe(
      DEFAULT_AGENT_DISCLOSURE_LEVEL,
    );
  });

  /*
   * The wire values are what the web app turns into `t()` keys, so a typo here
   * would render a raw key in the middle of a privacy contract. The type system
   * already rejects an unknown id; this catches the runtime half — a bullet
   * removed from the catalogue while a level still points at it.
   */
  it("only references bullet ids the catalogue defines", () => {
    for (const level of AGENT_DISCLOSURE_LEVELS) {
      for (const id of [...level.allowIds, ...level.blockIds]) {
        expect(BULLET_IDS).toContain(id);
      }
    }
  });

  it("defines no bullet that no level uses", () => {
    const referenced = new Set<string>(
      AGENT_DISCLOSURE_LEVELS.flatMap((level) => [
        ...level.allowIds,
        ...level.blockIds,
      ]),
    );

    expect([...BULLET_IDS].filter((id) => !referenced.has(id))).toEqual([]);
  });

  /*
   * `allows` / `blocks` are the English the MCP writes into an agent's prompt;
   * `allowIds` / `blockIds` are what the UI translates. They are two views of
   * one list, and this is the assertion that keeps them one list.
   */
  it("keeps the English lists exactly in step with the wire values", () => {
    for (const level of AGENT_DISCLOSURE_LEVELS) {
      expect(level.allows).toEqual(
        level.allowIds.map((id) => AGENT_DISCLOSURE_BULLETS[id]),
      );
      expect(level.blocks).toEqual(
        level.blockIds.map((id) => AGENT_DISCLOSURE_BULLETS[id]),
      );
    }
  });

  it("lists no bullet twice within one level", () => {
    for (const level of AGENT_DISCLOSURE_LEVELS) {
      const ids = [...level.allowIds, ...level.blockIds];
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("still names the employer as blocked at the default level", () => {
    expect(AGENT_DISCLOSURE_LEVELS[0].blockIds).toContain(
      "employer-and-client-names",
    );
    expect(AGENT_DISCLOSURE_LEVELS[0].blocks).toContain(
      "Employer and client names",
    );
  });

  it("blocks nothing extra at the least restrictive level", () => {
    const full = AGENT_DISCLOSURE_LEVELS.at(-1);

    expect(full?.value).toBe("full");
    expect(full?.blockIds).toEqual([]);
    expect(full?.blocks).toEqual([]);
  });
});
