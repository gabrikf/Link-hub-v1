import {
  LoadingLabel,
  Skeleton,
  SkeletonText,
} from "../../../shared-components/skeleton";

/**
 * Placeholder for the contents of the public profile card: the cover strip and
 * the block area beneath it.
 *
 * It is rendered INSIDE the same card shell the loaded profile uses (see
 * `public-profile-page.tsx`), so the page frame, its background and the login
 * control never re-mount when the data lands — only this inner content swaps.
 *
 * The block grid is the one thing that cannot be mirrored exactly: the user's
 * arrangement (how many blocks, which kinds, what spans) IS the payload we are
 * waiting for. We stand in with the arrangement every profile starts from —
 * the header block, then a stack of links.
 */
export function PublicProfileSkeleton() {
  return (
    <>
      <LoadingLabel>Loading profile</LoadingLabel>

      {/* Cover strip — same height as `ProfileCover`. */}
      <Skeleton className="h-32 w-full rounded-none sm:h-44" />

      {/* Same pull-up as the loaded card, so the avatar overlaps the cover. */}
      <div className="-mt-14 px-6 pb-8 sm:px-8">
        <div className="space-y-6">
          {/* Header block: avatar, name, handle, bio. */}
          <div className="flex flex-col items-center gap-4">
            <Skeleton
              shape="circle"
              width={92}
              height={92}
              className="ring-2 ring-white dark:ring-zinc-900"
            />
            <div className="flex w-full flex-col items-center gap-2">
              <Skeleton shape="text" height={32} width={200} />
              <Skeleton shape="text" height={24} width={120} />
              <SkeletonText lines={2} className="w-full max-w-xl" />
            </div>
          </div>

          {/* Links block. */}
          <div className="space-y-3">
            <ProfileLinksSkeleton />
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Placeholders shaped like the link rows the profile's `links` block renders:
 * same 2xl card and `px-4 py-3` box, the 28px round icon chip, the title line
 * and the URL line. Shared with `profile-blocks.tsx`, which renders it in place
 * of the (misleading) "No public links yet" copy while links are still loading.
 */
export function ProfileLinksSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          style={{ animationDelay: `${0.15 + index * 0.07}s` }}
          className="anim-fade-up rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/70"
        >
          <div className="flex items-center gap-2">
            <Skeleton shape="circle" width={28} height={28} />
            <Skeleton shape="text" height={24} width="45%" />
          </div>
          <Skeleton shape="text" height={20} width="70%" className="mt-1" />
        </div>
      ))}
    </>
  );
}
