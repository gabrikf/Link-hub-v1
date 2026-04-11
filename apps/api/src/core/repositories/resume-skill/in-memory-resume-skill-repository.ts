import { ResumeSkillEntity } from "../../entity/resume-skill/resume-skill-entity.js";
import { IResumeSkillRepository } from "./resume-skill-repository.js";

export class InMemoryResumeSkillRepository implements IResumeSkillRepository {
  private items: ResumeSkillEntity[] = [];

  async listByResumeId(resumeId: string): Promise<ResumeSkillEntity[]> {
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

  async exists(resumeId: string, skillId: string): Promise<boolean> {
    return this.items.some(
      (item) => item.resumeId === resumeId && item.skillId === skillId,
    );
  }

  async replaceForResume(
    resumeId: string,
    items: Array<{ skillId: string; yearsExperience: number | null }>,
  ): Promise<void> {
    this.items = this.items.filter((item) => item.resumeId !== resumeId);

    items.forEach((item, index) => {
      this.items.push(
        ResumeSkillEntity.create({
          resumeId,
          skillId: item.skillId,
          skillName: "Skill",
          yearsExperience: item.yearsExperience,
          displayOrder: index,
        }),
      );
    });
  }

  async create(input: {
    resumeId: string;
    skillId: string;
    yearsExperience: number | null;
    displayOrder: number;
  }): Promise<ResumeSkillEntity> {
    const created = ResumeSkillEntity.create({
      resumeId: input.resumeId,
      skillId: input.skillId,
      skillName: "Skill",
      yearsExperience: input.yearsExperience,
      displayOrder: input.displayOrder,
    });

    this.items.push(created);
    return created;
  }

  seed(item: ResumeSkillEntity) {
    this.items.push(item);
  }
}
