export interface IHashProvider {
  hash(plain: string): Promise<string>;
}
