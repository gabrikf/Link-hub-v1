import { WorkExperienceEntity } from "../../entity/work-experience/work-experience-entity.js";
import { IWorkExperienceRepository } from "./work-experience-repository.js";

export class InMemoryWorkExperienceRepository
  implements IWorkExperienceRepository
{
  public items: WorkExperienceEntity[] = [];

  seed(workExperience: WorkExperienceEntity): WorkExperienceEntity {
    this.items.push(workExperience);
    return workExperience;
  }

  async findById(id: string): Promise<WorkExperienceEntity | null> {
    return this.items.find((item) => item.id === id) ?? null;
  }

  async findByUserId(userId: string): Promise<WorkExperienceEntity[]> {
    return this.items
      .filter((item) => item.userId === userId)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  async findLastOrderByUserId(userId: string): Promise<number | null> {
    const userItems = this.items.filter((item) => item.userId === userId);

    if (userItems.length === 0) {
      return null;
    }

    return Math.max(...userItems.map((item) => item.displayOrder));
  }

  async create(
    workExperience: WorkExperienceEntity,
  ): Promise<WorkExperienceEntity> {
    this.items.push(workExperience);
    return workExperience;
  }

  async update(
    workExperience: WorkExperienceEntity,
  ): Promise<WorkExperienceEntity> {
    const index = this.items.findIndex(
      (item) => item.id === workExperience.id,
    );

    if (index >= 0) {
      this.items[index] = workExperience;
    }

    return workExperience;
  }

  async delete(id: string): Promise<void> {
    this.items = this.items.filter((item) => item.id !== id);
  }
}
