import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SURFACE } from "../../../shared-components/surface";
import { useState } from "react";
import type {
  CreateWorkExperienceInput,
  WorkExperienceResponse,
} from "@repo/schemas";
import { FiBriefcase, FiEdit2, FiPlus, FiTrash2 } from "react-icons/fi";
import {
  createWorkExperience,
  deleteWorkExperience,
  fetchMyWorkExperiences,
  updateWorkExperience,
} from "../../../lib/auth-api";
import { Button } from "../../../shared-components/button";
import { FeedbackMessage } from "../../../shared-components/feedback-message";
import {
  LoadingLabel,
  Skeleton,
} from "../../../shared-components/skeleton";
import {
  formatWorkDateRange,
  formatWorkLocation,
} from "../utils/work-experience-format";
import { WorkExperienceForm } from "./work-experience-form";

type WorkHistoryManagerProps = {
  enabled?: boolean;
  onMutated?: () => void;
};

export function WorkHistoryManager({
  enabled = true,
  onMutated,
}: WorkHistoryManagerProps) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const workExperiencesQuery = useQuery({
    queryKey: ["work-experiences"],
    queryFn: fetchMyWorkExperiences,
    enabled,
  });

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["work-experiences"] });
    onMutated?.();
  };

  const createMutation = useMutation({
    mutationFn: createWorkExperience,
    onSuccess: () => {
      handleSuccess();
      setIsAdding(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: CreateWorkExperienceInput;
    }) => updateWorkExperience(id, payload),
    onSuccess: () => {
      handleSuccess();
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWorkExperience,
    onSuccess: handleSuccess,
  });

  const workExperiences = workExperiencesQuery.data ?? [];

  return (
    <section className={`p-4 ${SURFACE}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="inline-flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            <FiBriefcase className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
            Work history
          </h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Roles shown on your public profile.
          </p>
        </div>
        {!isAdding && !editingId ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            fullWidth={false}
            className="rounded-full"
            onClick={() => setIsAdding(true)}
          >
            <FiPlus className="h-4 w-4" aria-hidden="true" />
            Add
          </Button>
        ) : null}
      </div>

      {isAdding ? (
        <div className="mt-4">
          <WorkExperienceForm
            isSubmitting={createMutation.isPending}
            submitLabel="Add experience"
            onSubmit={async (payload) => {
              await createMutation.mutateAsync(payload);
            }}
            onCancel={() => setIsAdding(false)}
          />
        </div>
      ) : null}

      {createMutation.isError ? (
        <div className="mt-3">
          <FeedbackMessage
            tone="error"
            message="Unable to add the work experience."
          />
        </div>
      ) : null}

      {workExperiencesQuery.isLoading ? (
        <WorkHistoryListSkeleton />
      ) : workExperiences.length === 0 && !isAdding ? (
        <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-400">
          No work experience yet. Click “Add” to create your first entry.
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {workExperiences.map((item) =>
            editingId === item.id ? (
              <li key={item.id}>
                <WorkExperienceForm
                  initialValue={item}
                  isSubmitting={updateMutation.isPending}
                  submitLabel="Save changes"
                  onSubmit={async (payload) => {
                    await updateMutation.mutateAsync({ id: item.id, payload });
                  }}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <WorkHistoryRow
                key={item.id}
                item={item}
                disabled={isAdding || Boolean(editingId)}
                onEdit={() => {
                  setIsAdding(false);
                  setEditingId(item.id);
                }}
                onDelete={() => deleteMutation.mutate(item.id)}
              />
            ),
          )}
        </ul>
      )}
    </section>
  );
}

/**
 * Stand-in for a `<WorkHistoryRow>`: same `rounded-xl … p-3` row, the same
 * three stacked lines on the left (title / company / date · location) and the
 * same pair of `size="icon"` (h-9 w-9) buttons on the right.
 */
function WorkHistoryRowSkeleton() {
  return (
    <li className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/40">
      <div className="min-w-0 flex-1">
        <div className="flex h-5 items-center">
          <Skeleton shape="text" height={12} width="48%" />
        </div>
        <div className="flex h-5 items-center">
          <Skeleton shape="text" height={12} width="36%" />
        </div>
        <div className="mt-0.5 flex h-4 items-center">
          <Skeleton shape="text" height={10} width="58%" />
        </div>
      </div>

      <div className="flex shrink-0 gap-1">
        <Skeleton height={36} width={36} className="rounded-md" />
        <Skeleton height={36} width={36} className="rounded-md" />
      </div>
    </li>
  );
}

function WorkHistoryListSkeleton() {
  return (
    <>
      <LoadingLabel>Loading work history</LoadingLabel>
      <ul className="mt-4 space-y-2">
        {Array.from({ length: 3 }, (_, index) => (
          <WorkHistoryRowSkeleton key={index} />
        ))}
      </ul>
    </>
  );
}

type WorkHistoryRowProps = {
  item: WorkExperienceResponse;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
};

function WorkHistoryRow({
  item,
  disabled,
  onEdit,
  onDelete,
}: WorkHistoryRowProps) {
  const dateRange = formatWorkDateRange(
    item.startDate,
    item.endDate,
    item.isCurrent,
  );
  const location = formatWorkLocation(item);

  return (
    <li className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/40">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {item.title}
        </p>
        <p className="truncate text-sm text-zinc-700 dark:text-zinc-300">
          {item.companyName}
        </p>
        <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
          {[dateRange, location].filter(Boolean).join(" · ")}
        </p>
      </div>

      <div className="flex shrink-0 gap-1">
        <Button
          type="button"
          variant="icon"
          size="icon"
          fullWidth={false}
          aria-label="Edit work experience"
          disabled={disabled}
          onClick={onEdit}
        >
          <FiEdit2 className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="danger"
          size="icon"
          fullWidth={false}
          aria-label="Delete work experience"
          shouldHaveConfirmation
          confirmationTitle="Delete this experience?"
          confirmationDescription="This will remove it from your profile."
          disabled={disabled}
          onClick={onDelete}
        >
          <FiTrash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}
