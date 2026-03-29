import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { RouterProvider } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { GoogleOAuthProvider } from "@react-oauth/google";
import "./index.css";
import { queryClient } from "./lib/query-client";
import { router } from "./router";
import { initializeTheme } from "./lib/theme";

initializeTheme();

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

const app = (
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
    <ReactQueryDevtools initialIsOpen={false} />
    <TanStackRouterDevtools router={router} />
  </QueryClientProvider>
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {googleClientId ? (
      <GoogleOAuthProvider clientId={googleClientId}>{app}</GoogleOAuthProvider>
    ) : (
      app
    )}
  </StrictMode>,
);
