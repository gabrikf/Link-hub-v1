export interface BaseEntityProps {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export class BaseEntity<T extends BaseEntityProps> {
  id: string;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: T) {
    const { id, createdAt, updatedAt, ...rest } = props;
    Object.assign(this, rest);
    this.id = id;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  protected static buildBaseProps(): Pick<
    BaseEntityProps,
    "id" | "createdAt" | "updatedAt"
  > {
    return {
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  static create<T extends BaseEntityProps, TClass extends BaseEntity<T>>(
    this: new (props: T) => TClass,
    props: Omit<T, "id" | "createdAt" | "updatedAt">
  ): TClass {
    const baseProps = BaseEntity.buildBaseProps();
    return new this({
      ...baseProps,
      ...props,
    } as T);
  }

  updateTimestamp() {
    this.updatedAt = new Date();
  }

  update(props: Partial<Omit<T, "id" | "createdAt" | "updatedAt">>) {
    Object.assign(this, props);
    this.updateTimestamp();
  }
}
