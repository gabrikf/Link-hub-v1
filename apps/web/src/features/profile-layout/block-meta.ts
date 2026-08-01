import type { BlockKind, CustomBlockKind } from "@repo/schemas";
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

export const BLOCK_META: Record<
  BlockKind,
  { label: string; description: string; Icon: IconType }
> = {
  header: {
    label: "Profile header",
    description: "Avatar, name, username and bio.",
    Icon: FiUser,
  },
  links: {
    label: "Links",
    description: "Your public links list.",
    Icon: FiLink2,
  },
  resume: {
    label: "Resume",
    description: "Professional summary and details.",
    Icon: FiFileText,
  },
  work_experiences: {
    label: "Work history",
    description: "Your professional experience.",
    Icon: FiBriefcase,
  },
  text: {
    label: "Text",
    description: "A rich block of custom text.",
    Icon: FiType,
  },
  video: {
    label: "Video",
    description: "Embed a YouTube or Vimeo video.",
    Icon: FiVideo,
  },
  image: {
    label: "Image",
    description: "A single image or a gallery.",
    Icon: FiImage,
  },
  button: {
    label: "Button",
    description: "A call-to-action link button.",
    Icon: FiMousePointer,
  },
  posts: {
    label: "Posts",
    description: "A feed of your published posts.",
    Icon: FiRss,
  },
};

/** Subset of BLOCK_META for the "add custom block" menu. */
export const CUSTOM_BLOCK_META: Record<
  CustomBlockKind,
  { label: string; description: string; Icon: IconType }
> = {
  text: BLOCK_META.text,
  video: BLOCK_META.video,
  image: BLOCK_META.image,
  button: BLOCK_META.button,
  posts: BLOCK_META.posts,
};
