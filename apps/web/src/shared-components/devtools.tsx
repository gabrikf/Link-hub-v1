import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import type { router as AppRouter } from "../router";

/**
 * Development-only panel, in its own module so `main.tsx` can reach it through
 * a single dynamic import that the production build drops entirely. Nothing
 * here should ever be imported statically from application code.
 */
export default function Devtools({ router }: { router: typeof AppRouter }) {
  return (
    <>
      <ReactQueryDevtools initialIsOpen={false} />
      <TanStackRouterDevtools router={router} />
    </>
  );
}
