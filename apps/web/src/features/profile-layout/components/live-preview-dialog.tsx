import type { FullProfileLayout, ProfileViewport } from "@repo/schemas";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { FiMonitor, FiSmartphone } from "react-icons/fi";
import { Dialog } from "../../../shared-components/dialog";
import { PublicProfilePreview } from "../../profile/components/public-profile-preview";
import { buildDefaultLayout, PROFILE_CANVAS_WIDTH } from "../grid-utils";

type PreviewProps = ComponentProps<typeof PublicProfilePreview>;

type LivePreviewDialogProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** False on a narrow screen, where only the phone render is offered. */
  canPreviewPc: boolean;
  /** The device being previewed — the modal's own switch, not the editor's. */
  device: ProfileViewport;
  onDeviceChange: (device: ProfileViewport) => void;
  /** Undefined until `GET /me/layout` lands; the default layout stands in. */
  full: FullProfileLayout | undefined;
  /** Used until `full` arrives, so the strip does not flicker on open. */
  fallbackTabsEnabled: boolean;
  profile: PreviewProps["profile"];
  links: PreviewProps["links"];
  resume: PreviewProps["resume"];
  workExperiences: PreviewProps["workExperiences"];
  resumeLoading: boolean;
  workLoading: boolean;
  linksLoading: boolean;
}>;

/**
 * The live-preview modal: a device switch, and the public profile rendered in a
 * frame the width of that device.
 */
export function LivePreviewDialog({
  open,
  onOpenChange,
  canPreviewPc,
  device,
  onDeviceChange,
  full,
  fallbackTabsEnabled,
  profile,
  links,
  resume,
  workExperiences,
  resumeLoading,
  workLoading,
  linksLoading,
}: LivePreviewDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("common.livePreview")}
      contentClassName="w-[96vw] max-w-6xl"
    >
      <div className="space-y-4">
        {/*
          The device switch exists only where both devices are previewable.
          On a narrow screen there is one preview — the phone one — and a
          switch offering a 1024px desktop render inside a 320px modal was
          offering an unreadable thing. The sentence replaces it rather than
          leaving a blank row, so the missing switch is explained, not just
          gone.
        */}
        {canPreviewPc ? (
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-700 dark:bg-zinc-800">
              {(
                [
                  {
                    value: "pc",
                    label: t("layout.viewport.desktop"),
                    Icon: FiMonitor,
                  },
                  {
                    value: "mobile",
                    label: t("layout.viewport.mobile"),
                    Icon: FiSmartphone,
                  },
                ] as const
              ).map((option) => {
                const isActive = device === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => onDeviceChange(option.value)}
                    className={[
                      "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition",
                      isActive
                        ? "bg-white text-violet-700 shadow-sm dark:bg-zinc-900 dark:text-violet-200"
                        : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200",
                    ].join(" ")}
                  >
                    <option.Icon className="h-4 w-4" aria-hidden="true" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="flex items-start justify-center gap-2 text-center text-xs text-zinc-600 dark:text-zinc-300">
            <FiSmartphone
              className="mt-px h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-300"
              aria-hidden="true"
            />
            {t("layout.previewMobileOnly")}
          </p>
        )}

        {/*
          A PLAIN BLOCK, not `flex justify-center overflow-x-auto`.
          The phone mock is 410px wide (a 390px screen plus its bezel) and
          asks for `max-width: 100%`. As a centred FLEX ITEM that clamp
          resolved against the item's own max-content width, so at 375px the
          mock stayed 410px inside a 320px modal body and bled 17px off the
          left and 25px off the right — clipped by the dialog's
          `overflow-hidden`, and unreachable by the scrollbar because
          `justify-center` puts overflow on BOTH sides where only the right
          half can be scrolled to. That is the lateral cropping in the bug
          report. As a block child the clamp resolves against the modal body
          and the mock simply shrinks to fit.
        */}
        <div className="w-full">
          <PublicProfilePreview
            layout={full ? full[device] : buildDefaultLayout(device)}
            viewport={device}
            // Both modes are framed: the dialog is already titled "Live
            // preview", so the component's own inline badge would be the
            // same words twice. The desktop number is the canvas the pc
            // layout is designed on, so the preview is that wide and no
            // wider — the modal is 1150px and no layout uses the extra.
            frameWidth={device === "mobile" ? 390 : PROFILE_CANVAS_WIDTH.pc}
            profile={profile}
            links={links}
            resume={resume}
            workExperiences={workExperiences}
            resumeLoading={resumeLoading}
            workLoading={workLoading}
            linksLoading={linksLoading}
            // The modal previews whichever device its own toggle names, so
            // it reads THAT viewport's flag — not the one being edited.
            tabsEnabled={full ? full[device].tabsEnabled : fallbackTabsEnabled}
          />
        </div>
      </div>
    </Dialog>
  );
}
