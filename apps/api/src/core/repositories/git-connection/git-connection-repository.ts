import type { GitConnectionProvider } from "@repo/schemas";
import { GitConnectionEntity } from "../../entity/git-connection/git-connection-entity.js";

export interface IGitConnectionRepository {
  create(connection: GitConnectionEntity): Promise<GitConnectionEntity>;
  findById(id: string): Promise<GitConnectionEntity | null>;
  findByUserId(userId: string): Promise<GitConnectionEntity[]>;
  /**
   * Routes an inbound webhook to the connection that owns it. A forge delivery
   * carries an account id and nothing else LinkHub controls, so this is the only
   * way to answer "whose activity is this" without trusting the payload.
   */
  findByExternalAccount(
    provider: GitConnectionProvider,
    externalAccountId: string,
  ): Promise<GitConnectionEntity | null>;
  /**
   * Every connection allowed to publish, regardless of whether it is due yet.
   *
   * The cadence question is answered by `GitConnectionEntity.isDueForDigest`,
   * not by SQL: the interval rules (calendar months, never-digested counting as
   * due) are domain rules, and expressing them a second time in a WHERE clause
   * is how the worker and the settings screen start disagreeing.
   */
  listAutoPostEnabled(): Promise<GitConnectionEntity[]>;
  update(connection: GitConnectionEntity): Promise<GitConnectionEntity>;
  delete(id: string): Promise<void>;
}
