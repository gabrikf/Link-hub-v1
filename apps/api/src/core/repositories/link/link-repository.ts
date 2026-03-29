import { LinkEntity } from "../../entity/link/link-entity.js";

export interface ILinksRepository {
  findById(id: string): Promise<LinkEntity | null>;
  findByUserId(userId: string): Promise<LinkEntity[]>;
  findPublicByUserId(userId: string): Promise<LinkEntity[]>;
  findLastOrderByUserId(userId: string): Promise<number | null>;
  create(link: LinkEntity): Promise<LinkEntity>;
  update(link: LinkEntity): Promise<LinkEntity>;
  delete(id: string): Promise<void>;
  reorderByIds(userId: string, linkIds: string[]): Promise<void>;
}
