import { zodResolver } from "@hookform/resolvers/zod";
import { createUserSchemaInput } from "@repo/schemas";
import type { CreateUserInput } from "@repo/schemas";
import type { TFunction } from "i18next";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FiLoader, FiUserPlus } from "react-icons/fi";
import { FeedbackMessage } from "../../../shared-components/feedback-message";
import { Button } from "../../../shared-components/button";
import { Input } from "../../../shared-components/input";
import { FOCUS_RING } from "../../../shared-components/surface";

type RegisterFormProps = Readonly<{
  isPending: boolean;
  errorMessage?: string;
  /**
   * Opens the "reset your password" screen. It belongs on this tab too: a
   * person who cannot get in often assumes they never registered, and lands
   * here rather than on the sign-in tab.
   */
  onForgotPassword?: () => void;
  // Rejects when the registration fails. The parent owns how that reads to the
  // user and passes it back down as `errorMessage`.
  onSubmit: (data: CreateUserInput) => Promise<void>;
}>;

// Friendly labels for the optional persona picker. Values must match
// `personaSchema` in @repo/schemas.
const getPersonaOptions = (
  t: TFunction,
): ReadonlyArray<{ value: string; label: string }> => [
  { value: "developer", label: t("enum.persona.developer") },
  { value: "designer", label: t("enum.persona.designer") },
  { value: "product-manager", label: t("enum.persona.product-manager") },
  { value: "product-owner", label: t("enum.persona.product-owner") },
  { value: "qa-engineer", label: t("enum.persona.qa-engineer") },
  { value: "data", label: t("enum.persona.data") },
  { value: "devops", label: t("enum.persona.devops") },
  { value: "other", label: t("common.other") },
];

export function RegisterForm({
  isPending,
  errorMessage,
  onForgotPassword,
  onSubmit,
}: RegisterFormProps) {
  const { t } = useTranslation();
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
  const personaOptions = getPersonaOptions(t);

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        // `handleSubmit` hands back a promise-returning handler, and the DOM
        // `onSubmit` attribute wants one that returns nothing. Discarding the
        // promise is safe here and only here: every rejection is already dealt
        // with inside the callback below.
        void handleSubmit(async (data) => {
          try {
            await onSubmit(data);
          } catch {
            // An address that is already registered is an ordinary outcome, and
            // it is already handled: the parent renders it as `errorMessage`
            // below. react-hook-form re-throws whatever the submit handler
            // rejects with, so letting it through would hand the message —
            // which quotes the email the user just typed — to the global
            // unhandledrejection handler, which is Sentry in production.
            // Keep the typed values so the correction is one edit, not a retype.
            return;
          }

          reset();
        })(event);
      }}
    >
      <Input
        id="register-name"
        label={t("common.name")}
        error={errors.name?.message}
        {...register("name")}
      />

      <Input
        id="register-login"
        label={t("auth.handleLabel")}
        error={errors.login?.message}
        {...register("login")}
      />

      <Input
        id="register-email"
        type="email"
        label={t("common.email")}
        error={errors.email?.message}
        {...register("email")}
      />

      <Input
        id="register-password"
        type="password"
        label={t("common.password")}
        error={errors.password?.message}
        {...register("password")}
      />

      <div>
        <label
          className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300"
          htmlFor="register-persona"
        >
          {t("auth.roleOptional")}
        </label>
        <select
          id="register-persona"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          defaultValue=""
          {...register("persona", {
            setValueAs: (value: unknown) => (value === "" ? undefined : value),
          })}
        >
          <option value="">{t("auth.preferNotToSay")}</option>
          {personaOptions.map((option) => (
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
            {t("auth.creatingAccount")}
          </>
        ) : (
          <>
            <FiUserPlus className="h-4 w-4" />
            {t("auth.createAccount")}
          </>
        )}
      </Button>

      {/* Footer placement, under the primary action: on this tab it is a way
          out for somebody in the wrong place, not a step in signing up. */}
      {onForgotPassword && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onForgotPassword}
            className={`rounded-md text-xs font-medium text-violet-700 underline-offset-2 hover:underline dark:text-violet-300 ${FOCUS_RING}`}
          >
            {t("auth.forgotPassword")}
          </button>
        </div>
      )}
    </form>
  );
}
