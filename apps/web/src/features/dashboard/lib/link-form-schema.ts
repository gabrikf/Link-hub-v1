import { createLinkSchemaInput, type LinkIcon } from "@repo/schemas";
import type { ReactNode } from "react";
import { z } from "zod/v4";

export type LinkIconSelectOption = {
  value: LinkIcon | "";
  label: string;
  icon?: ReactNode;
};

/**
 * Built from the same `createLinkSchemaInput` the API validates against, so a
 * title/URL the server would reject is caught in the browser with the server's
 * own wording instead of failing silently after a round trip. The form had no
 * resolver at all: a bad URL produced no message, no cleared form and no
 * request the user could see fail.
 *
 * The fields the API doesn't take (`iconOption` is a react-select option,
 * `editingLinkId` is local edit state) are re-declared here so `handleSubmit`
 * still receives them — a bare `zodResolver(createLinkSchemaInput)` would strip
 * them from the parsed output and break editing.
 */
export const linkFormSchema = createLinkSchemaInput
  .pick({ title: true, url: true })
  .extend({
    iconOption: z.custom<LinkIconSelectOption>(
      (value) => typeof value === "object" && value !== null,
    ),
    isPublic: z.boolean(),
    editingLinkId: z.string().nullable(),
  });

export type LinkFormValues = z.infer<typeof linkFormSchema>;
