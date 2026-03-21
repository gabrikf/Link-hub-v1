import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

const profileSchema = z.object({
  displayName: z.string().min(2, "Display name needs at least 2 characters"),
  bio: z.string().min(10, "Bio needs at least 10 characters"),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export function FormPage() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isSubmitSuccessful },
    reset,
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: "",
      bio: "",
    },
  });

  const onSubmit = async (data: ProfileFormData) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    console.log("Submitted form data:", data);
    reset();
  };

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-bold text-zinc-900">
        React Hook Form + Zod
      </h2>
      <p className="text-zinc-600">
        Use this route as a base for your auth/profile forms.
      </p>

      <form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
        <div>
          <label
            className="mb-1 block text-sm font-medium text-zinc-700"
            htmlFor="displayName"
          >
            Display name
          </label>
          <input
            id="displayName"
            className="w-full rounded-md border border-zinc-300 px-3 py-2"
            placeholder="Gabriel"
            {...register("displayName")}
          />
          {errors.displayName && (
            <p className="mt-1 text-sm text-red-600">
              {errors.displayName.message}
            </p>
          )}
        </div>

        <div>
          <label
            className="mb-1 block text-sm font-medium text-zinc-700"
            htmlFor="bio"
          >
            Bio
          </label>
          <textarea
            id="bio"
            className="w-full rounded-md border border-zinc-300 px-3 py-2"
            rows={4}
            placeholder="Building LinkHub with TanStack tools..."
            {...register("bio")}
          />
          {errors.bio && (
            <p className="mt-1 text-sm text-red-600">{errors.bio.message}</p>
          )}
        </div>

        <button
          className="rounded-md bg-zinc-900 px-4 py-2 text-white disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Saving..." : "Save"}
        </button>
      </form>

      {isSubmitSuccessful && (
        <p className="rounded-md bg-green-100 p-3 text-green-800">
          Form submitted successfully.
        </p>
      )}
    </section>
  );
}
