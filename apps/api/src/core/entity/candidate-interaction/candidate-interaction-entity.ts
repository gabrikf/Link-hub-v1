import type { InteractionType } from "@repo/schemas";
import { BaseEntity, type BaseEntityProps } from "../index.js";

/**
 * Named once, here. The union used to be spelled out as three literals in the
 * entity, the repository, the controller and the drizzle mapper — which is how
 * `NOT_RELEVANT` ended up accepted by the zod body schema and then invisible to
 * every type downstream of it. It is the only explicit negative signal the
 * product collects, so losing it costs the model more than any positive.
 */
export type CandidateInteractionType = InteractionType;

export interface CandidateInteractionEntityProps extends BaseEntityProps {
  resumeId: string;
  recruiterId: string;
  interactionType: CandidateInteractionType;
  queryText: string | null;
  semanticSimilarity: number | null;
  rankPosition: number | null;
  metadata: Record<string, unknown> | null;
  candidateSnapshot: Record<string, unknown> | null;
  querySnapshot: Record<string, unknown> | null;
  /**
   * Exposure context. Nullable because rows written before these columns
   * existed have none; training falls back to an IPS weight of 1 for those.
   */
  displayedRank: number | null;
  resultCount: number | null;
  searchSessionId: string | null;
  propensity: number | null;
  trainedAt: Date | null;
}

export class CandidateInteractionEntity extends BaseEntity<CandidateInteractionEntityProps> {
  resumeId: string;
  recruiterId: string;
  interactionType: CandidateInteractionType;
  queryText: string | null;
  semanticSimilarity: number | null;
  rankPosition: number | null;
  metadata: Record<string, unknown> | null;
  candidateSnapshot: Record<string, unknown> | null;
  querySnapshot: Record<string, unknown> | null;
  displayedRank: number | null;
  resultCount: number | null;
  searchSessionId: string | null;
  propensity: number | null;
  trainedAt: Date | null;

  constructor(props: CandidateInteractionEntityProps) {
    super(props);
    this.resumeId = props.resumeId;
    this.recruiterId = props.recruiterId;
    this.interactionType = props.interactionType;
    this.queryText = props.queryText;
    this.semanticSimilarity = props.semanticSimilarity;
    this.rankPosition = props.rankPosition;
    this.metadata = props.metadata;
    this.candidateSnapshot = props.candidateSnapshot;
    this.querySnapshot = props.querySnapshot;
    this.displayedRank = props.displayedRank;
    this.resultCount = props.resultCount;
    this.searchSessionId = props.searchSessionId;
    this.propensity = props.propensity;
    this.trainedAt = props.trainedAt;
  }
}
