export class BaseEntity<T> {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  constructor(
    props: Omit<T, "id" | "createdAt" | "updatedAt">,
    id?: string,
    createdAt?: Date,
    updatedAt?: Date
  ) {
    Object.assign(this, props);
    this.id = id ?? crypto.randomUUID();
    this.createdAt = createdAt ?? new Date();
    this.updatedAt = updatedAt ?? new Date();
  }

  updateTimestamp() {
    this.updatedAt = new Date();
  }
  update(props: Partial<Omit<T, "id" | "createdAt" | "updatedAt">>) {
    Object.assign(this, props);
    this.updateTimestamp();
  }
}
