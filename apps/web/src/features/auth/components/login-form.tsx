import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchemaInput } from "@repo/schemas";
import type { LoginInput } from "@repo/schemas";
import { useForm } from "react-hook-form";
import { FiLoader, FiLogIn } from "react-icons/fi";
import { Input } from "../../../shared-components/input";
import { Button } from "../../../shared-components/button";
import { FeedbackMessage } from "../../../shared-components/feedback-message";

type LoginFormProps = {
  isPending: boolean;
  errorMessage?: string;
  onSubmit: (data: LoginInput) => Promise<void>;
};

export function LoginForm({
  isPending,
  errorMessage,
  onSubmit,
}: LoginFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchemaInput),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  return (
    <form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
      <Input
        id="login-email"
        type="email"
        label="Email"
        error={errors.email?.message}
        {...register("email")}
      />

      <Input
        id="login-password"
        type="password"
        label="Password"
        error={errors.password?.message}
        {...register("password")}
      />

      {errorMessage && <FeedbackMessage message={errorMessage} tone="error" />}

      <Button type="submit" disabled={isPending}>
        {isPending ? (
          <>
            <FiLoader className="h-4 w-4 animate-spin" />
            Signing in...
          </>
        ) : (
          <>
            <FiLogIn className="h-4 w-4" />
            Sign in
          </>
        )}
      </Button>
    </form>
  );
}
