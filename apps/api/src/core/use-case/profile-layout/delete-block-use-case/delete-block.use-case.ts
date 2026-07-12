import { BUILTIN_BLOCK_KINDS, BuiltinBlockKind } from "@repo/schemas";
import {
  BadRequestError,
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { IProfileBlocksRepository } from "../../../repositories/profile-block/profile-block-repository.js";

export class DeleteBlockUseCase {
  constructor(private blocksRepository: IProfileBlocksRepository) {}

  async execute(userId: string, blockId: string) {
    const block = await this.blocksRepository.findById(blockId);

    if (!block) {
      throw new ResourceNotFoundError("ProfileBlock", blockId);
    }

    if (block.userId !== userId) {
      throw new ForbiddenError("You do not own this block");
    }

    if (BUILTIN_BLOCK_KINDS.includes(block.kind as BuiltinBlockKind)) {
      throw new BadRequestError(
        "Built-in blocks cannot be deleted, only hidden",
      );
    }

    await this.blocksRepository.delete(blockId);

    return { success: true };
  }
}
