import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { FiSave } from "react-icons/fi";
import { Button } from "../../../shared-components/button";
import { Input } from "../../../shared-components/input";
import { TextArea } from "../../../shared-components/text-area";

export type ProfileFormValues = {
  username: string;
  name: string;
  description: string;
};

type DashboardProfileFormProps = {
  initialValues: ProfileFormValues;
  onSubmit: (data: ProfileFormValues) => Promise<void>;
};

export function DashboardProfileForm({
  initialValues,
  onSubmit,
}: DashboardProfileFormProps) {
  const { register, handleSubmit, reset } = useForm<ProfileFormValues>({
    defaultValues: initialValues,
  });

  useEffect(() => {
    reset(initialValues);
  }, [initialValues, reset]);

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <Input id="profile-username" label="Username" {...register("username")} />
      <Input id="profile-name" label="Name" {...register("name")} />
      <TextArea
        id="profile-description"
        label="Description"
        rows={5}
        {...register("description")}
      />

      <Button className="w-auto" type="submit">
        <FiSave className="h-4 w-4" aria-hidden="true" />
        Save profile
      </Button>
    </form>
  );
}
