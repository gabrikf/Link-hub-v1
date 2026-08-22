import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppErrorBoundary } from "./app-error-boundary";

vi.mock("../lib/report-error", () => ({ reportError: vi.fn() }));

function Boom(): never {
  throw new Error("provider exploded");
}

describe("AppErrorBoundary", () => {
  it("renders its fallback WITHOUT any router context", () => {
    // No RouterProvider anywhere in this tree — which is the whole point. This
    // boundary sits above the router, so its fallback must not use <Link>.
    // Rendering it here would throw "useRouter" if it ever regressed.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    // A real anchor, so recovery works even when the router is the broken thing.
    expect(screen.getByRole("link", { name: /go home/i })).toHaveAttribute(
      "href",
      "/",
    );

    consoleError.mockRestore();
  });

  it("renders children when nothing throws", () => {
    render(
      <AppErrorBoundary>
        <p>all good</p>
      </AppErrorBoundary>,
    );

    expect(screen.getByText("all good")).toBeInTheDocument();
  });
});
