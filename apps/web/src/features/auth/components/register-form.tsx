import { zodResolver } from "@hookform/resolvers/zod";
import { createUserSchemaInput } from "@repo/schemas";
import type { CreateUserInput } from "@repo/schemas";
import { useForm } from "react-hook-form";
import { FeedbackMessage } from "../../../shared-components/feedback-message";
import { Button } from "../../../shared-components/button";
import { Input } from "../../../shared-components/input";

type RegisterFormProps = {
  isPending: boolean;
  errorMessage?: string;
  onSubmit: (data: CreateUserInput) => Promise<void>;
};

export function RegisterForm({
  isPending,
  errorMessage,
  onSubmit,
}: RegisterFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchemaInput),
    defaultValues: {
      email: "",
      login: "",
      name: "",
      password: "",
    },
  });

  return (
    <form
      className="space-y-3"
      onSubmit={handleSubmit(async (data) => {
        await onSubmit(data);
        reset();
      })}
    >
      <Input
        id="register-name"
        label="Name"
        error={errors.name?.message}
        {...register("name")}
      />

      <Input
        id="register-login"
        label="Login"
        error={errors.login?.message}
        {...register("login")}
      />

      <Input
        id="register-email"
        type="email"
        label="Email"
        error={errors.email?.message}
        {...register("email")}
      />

      <Input
        id="register-password"
        type="password"
        label="Password"
        error={errors.password?.message}
        {...register("password")}
      />

      {errorMessage && <FeedbackMessage message={errorMessage} tone="error" />}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating account..." : "Create account"}
      </Button>
    </form>
  );
}
