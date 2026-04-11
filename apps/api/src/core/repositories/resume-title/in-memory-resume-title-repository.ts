import { ResumeTitleEntity } from "../../entity/resume-title/resume-title-entity.js";
import { IResumeTitleRepository } from "./resume-title-repository.js";

export class InMemoryResumeTitleRepository implements IResumeTitleRepository {
  private items: ResumeTitleEntity[] = [];

  async listByResumeId(resumeId: string): Promise<ResumeTitleEntity[]> {
    return this.items
      .filter((item) => item.resumeId === resumeId)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  async findLastOrderByResumeId(resumeId: string): Promise<number | null> {
    const resumeItems = this.items.filter((item) => item.resumeId === resumeId);

    if (resumeItems.length === 0) {
      return null;
    }

    return Math.max(...resumeItems.map((item) => item.displayOrder));
  }

  async exists(resumeId: string, titleId: string): Promise<boolean> {
    return this.items.some(
      (item) => item.resumeId === resumeId && item.titleId === titleId,
    );
  }

  async clearPrimary(resumeId: string): Promise<void> {
    this.items.forEach((item) => {
      if (item.resumeId === resumeId) {
        item.isPrimary = false;
      }
    });
  }

  async replaceForResume(
    resumeId: string,
    items: Array<{ titleId: string; isPrimary: boolean }>,
  ): Promise<void> {
    this.items = this.items.filter((item) => item.resumeId !== resumeId);

    items.forEach((item, index) => {
      this.items.push(
        ResumeTitleEntity.create({
          resumeId,
          titleId: item.titleId,
          titleName: "Title",
          isPrimary: item.isPrimary,
          displayOrder: index,
        }),
      );
    });
  }

  async create(input: {
    resumeId: string;
    titleId: string;
    isPrimary: boolean;
    displayOrder: number;
  }): Promise<ResumeTitleEntity> {
    const created = ResumeTitleEntity.create({
      resumeId: input.resumeId,
      titleId: input.titleId,
      titleName: "Title",
      isPrimary: input.isPrimary,
      displayOrder: input.displayOrder,
    });

    this.items.push(created);
    return created;
  }

  seed(item: ResumeTitleEntity) {
    this.items.push(item);
  }
}
