import {
  CreateCandidateInteractionInput,
  ICandidateInteractionRepository,
} from "../../../repositories/candidate-interaction/candidate-interaction-repository.js";

export class RecordCandidateInteractionUseCase {
  constructor(
    private candidateInteractionRepository: ICandidateInteractionRepository,
  ) {}

  async execute(input: CreateCandidateInteractionInput) {
    return this.candidateInteractionRepository.create(input);
  }
}
