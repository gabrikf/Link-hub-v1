import { BaseEntity, type BaseEntityProps } from "../index.js";

export interface CandidateInteractionEntityProps extends BaseEntityProps {
  resumeId: string;
  recruiterId: string;
  interactionType: "EMAIL_COPY" | "CONTACT_CLICK" | "PROFILE_VIEW";
  queryText: string | null;
  semanticSimilarity: number | null;
  rankPosition: number | null;
  metadata: Record<string, unknown> | null;
  candidateSnapshot: Record<string, unknown> | null;
  querySnapshot: Record<string, unknown> | null;
  trainedAt: Date | null;
}

export class CandidateInteractionEntity extends BaseEntity<CandidateInteractionEntityProps> {
  resumeId: string;
  recruiterId: string;
  interactionType: "EMAIL_COPY" | "CONTACT_CLICK" | "PROFILE_VIEW";
  queryText: string | null;
  semanticSimilarity: number | null;
  rankPosition: number | null;
  metadata: Record<string, unknown> | null;
  candidateSnapshot: Record<string, unknown> | null;
  querySnapshot: Record<string, unknown> | null;
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
    this.trainedAt = props.trainedAt;
  }
}
