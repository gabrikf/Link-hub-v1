import type {
  ButtonBlockConfig,
  CustomBlockKind,
  ImageBlockConfig,
  PostsBlockConfig,
  ProfileBlock,
  TextBlockConfig,
  VideoBlockConfig,
} from "@repo/schemas";
import { ButtonBlockDialog } from "./button-block-dialog";
import { ImageBlockDialog } from "./image-block-dialog";
import { PostsBlockDialog } from "./posts-block-dialog";
import { TextBlockDialog } from "./text-block-dialog";
import { VideoBlockDialog } from "./video-block-dialog";

/** The config payload of any custom (i.e. non-builtin) block kind. */
export type CustomBlockConfig =
  | TextBlockConfig
  | VideoBlockConfig
  | ImageBlockConfig
  | ButtonBlockConfig
  | PostsBlockConfig;

type CustomBlockDialogsProps = Readonly<{
  /** Which editor is open, or null when none is. */
  openKind: CustomBlockKind | null;
  /** The block being edited, or null when a new block is being created. */
  block: ProfileBlock | null;
  isSubmitting: boolean;
  /** Called with `false` when whichever editor is open is dismissed. */
  onOpenChange: (open: boolean) => void;
  onSubmit: (kind: CustomBlockKind, config: CustomBlockConfig) => Promise<void>;
}>;

/**
 * The five custom-block editors, of which at most one is ever open. They are
 * mounted together because `openKind` is a single value: the dialog the user
 * asked for is the only one that opens, and every one of them closes the same
 * way.
 */
export function CustomBlockDialogs({
  openKind,
  block,
  isSubmitting,
  onOpenChange,
  onSubmit,
}: CustomBlockDialogsProps) {
  return (
    <>
      <TextBlockDialog
        open={openKind === "text"}
        onOpenChange={onOpenChange}
        initialConfig={
          block?.kind === "text" ? (block.config as TextBlockConfig) : null
        }
        isSubmitting={isSubmitting}
        onSubmit={(config) => onSubmit("text", config)}
      />
      <VideoBlockDialog
        open={openKind === "video"}
        onOpenChange={onOpenChange}
        initialConfig={
          block?.kind === "video" ? (block.config as VideoBlockConfig) : null
        }
        isSubmitting={isSubmitting}
        onSubmit={(config) => onSubmit("video", config)}
      />
      <ImageBlockDialog
        open={openKind === "image"}
        onOpenChange={onOpenChange}
        initialConfig={
          block?.kind === "image" ? (block.config as ImageBlockConfig) : null
        }
        isSubmitting={isSubmitting}
        onSubmit={(config) => onSubmit("image", config)}
      />
      <ButtonBlockDialog
        open={openKind === "button"}
        onOpenChange={onOpenChange}
        initialConfig={
          block?.kind === "button" ? (block.config as ButtonBlockConfig) : null
        }
        isSubmitting={isSubmitting}
        onSubmit={(config) => onSubmit("button", config)}
      />
      <PostsBlockDialog
        open={openKind === "posts"}
        onOpenChange={onOpenChange}
        initialConfig={
          block?.kind === "posts" ? (block.config as PostsBlockConfig) : null
        }
        isSubmitting={isSubmitting}
        onSubmit={(config) => onSubmit("posts", config)}
      />
    </>
  );
}
