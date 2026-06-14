import { WorkExperienceEntity } from "../../entity/work-experience/work-experience-entity.js";

export interface IWorkExperienceRepository {
  findById(id: string): Promise<WorkExperienceEntity | null>;
  findByUserId(userId: string): Promise<WorkExperienceEntity[]>;
  findLastOrderByUserId(userId: string): Promise<number | null>;
  create(workExperience: WorkExperienceEntity): Promise<WorkExperienceEntity>;
  update(workExperience: WorkExperienceEntity): Promise<WorkExperienceEntity>;
  delete(id: string): Promise<void>;
}
