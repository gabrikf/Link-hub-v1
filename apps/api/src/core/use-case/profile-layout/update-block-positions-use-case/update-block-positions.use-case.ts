import { UpdateBlockPositionsInput } from "@repo/schemas";
import { BadRequestError } from "../../../errors/index.js";
import { IProfileBlocksRepository } from "../../../repositories/profile-block/profile-block-repository.js";

export class UpdateBlockPositionsUseCase {
  constructor(private blocksRepository: IProfileBlocksRepository) {}

  async execute(userId: string, input: UpdateBlockPositionsInput) {
    const { viewport, positions } = input;

    const existingBlocks =
      await this.blocksRepository.findByUserAndViewport(userId, viewport);
    const existingIds = new Set(existingBlocks.map((block) => block.id));

    const hasForeignId = positions.some(
      (position) => !existingIds.has(position.id),
    );
    if (hasForeignId) {
      throw new BadRequestError(
        "All positions must reference blocks owned by the user in this viewport",
      );
    }

    await this.blocksRepository.updatePositions(userId, viewport, positions);

    return { success: true };
  }
}
