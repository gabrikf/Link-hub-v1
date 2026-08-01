import { zodResolver } from "@hookform/resolvers/zod";
import { createUserSchemaInput } from "@repo/schemas";
import type { CreateUserInput } from "@repo/schemas";
import { useForm } from "react-hook-form";
import { FiLoader, FiUserPlus } from "react-icons/fi";
import { FeedbackMessage } from "../../../shared-components/feedback-message";
import { Button } from "../../../shared-components/button";
import { Input } from "../../../shared-components/input";

type RegisterFormProps = {
  isPending: boolean;
  errorMessage?: string;
  onSubmit: (data: CreateUserInput) => Promise<void>;
};

// Friendly labels for the optional persona picker. Values must match
// `personaSchema` in @repo/schemas.
const PERSONA_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "developer", label: "Developer" },
  { value: "designer", label: "Designer" },
  { value: "product-manager", label: "Product Manager" },
  { value: "product-owner", label: "Product Owner" },
  { value: "qa-engineer", label: "QA Engineer" },
  { value: "data", label: "Data" },
  { value: "devops", label: "DevOps" },
  { value: "other", label: "Other" },
];

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

      <div>
        <label
          className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300"
          htmlFor="register-persona"
        >
          Role (optional)
        </label>
        <select
          id="register-persona"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          defaultValue=""
          {...register("persona", {
            setValueAs: (value) => (value === "" ? undefined : value),
          })}
        >
          <option value="">Prefer not to say</option>
          {PERSONA_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {errors.persona?.message && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
            {errors.persona.message}
          </p>
        )}
      </div>

      {errorMessage && <FeedbackMessage message={errorMessage} tone="error" />}

      <Button type="submit" disabled={isPending}>
        {isPending ? (
          <>
            <FiLoader className="h-4 w-4 animate-spin" />
            Creating account...
          </>
        ) : (
          <>
            <FiUserPlus className="h-4 w-4" />
            Create account
          </>
        )}
      </Button>
    </form>
  );
}
