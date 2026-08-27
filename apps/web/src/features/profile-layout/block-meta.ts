import type { BlockKind, CustomBlockKind } from "@repo/schemas";
import type { TFunction } from "i18next";
import type { IconType } from "react-icons";
import {
  FiBriefcase,
  FiFileText,
  FiImage,
  FiLink2,
  FiMousePointer,
  FiRss,
  FiType,
  FiUser,
  FiVideo,
} from "react-icons/fi";

export function getBlockMeta(
  t: TFunction,
): Record<BlockKind, { label: string; description: string; Icon: IconType }> {
  return {
    header: {
      label: t("layout.block.header"),
      description: t("layout.block.headerDescription"),
      Icon: FiUser,
    },
    links: {
      label: t("common.links"),
      description: t("layout.block.linksDescription"),
      Icon: FiLink2,
    },
    resume: {
      label: t("common.resume"),
      description: t("layout.block.resumeDescription"),
      Icon: FiFileText,
    },
    work_experiences: {
      label: t("common.workHistory"),
      description: t("layout.block.workDescription"),
      Icon: FiBriefcase,
    },
    text: {
      label: t("common.text"),
      description: t("layout.block.textDescription"),
      Icon: FiType,
    },
    video: {
      label: t("common.video"),
      description: t("layout.block.videoDescription"),
      Icon: FiVideo,
    },
    image: {
      label: t("common.image"),
      description: t("layout.block.imageDescription"),
      Icon: FiImage,
    },
    button: {
      label: t("common.button"),
      description: t("layout.block.buttonDescription"),
      Icon: FiMousePointer,
    },
    posts: {
      label: t("common.posts"),
      description: t("layout.block.postsDescription"),
      Icon: FiRss,
    },
  };
}

/** Subset of `getBlockMeta` for the "add custom block" menu. */
export function getCustomBlockMeta(
  t: TFunction,
): Record<
  CustomBlockKind,
  { label: string; description: string; Icon: IconType }
> {
  const blockMeta = getBlockMeta(t);
  return {
    text: blockMeta.text,
    video: blockMeta.video,
    image: blockMeta.image,
    button: blockMeta.button,
    posts: blockMeta.posts,
  };
}
