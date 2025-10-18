export interface ICreateUserUseCaseInput {
  email: string;
  login: string;
  password: string;
  name: string;
  description?: string | null;
  avatarUrl?: string | null;
}

export interface ILoginUseCaseInput {
  email: string;
  password: string;
}

export interface ICreateUserUseCaseOutput {
  user: {
    id: string;
    email: string;
    login: string;
    name: string;
    description?: string | null;
    avatarUrl?: string | null;
    createdAt: string; // ISO string
    updatedAt: string; // ISO string
  };
  token: string;
}
