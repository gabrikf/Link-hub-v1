import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom implements no layout, so `scrollIntoView` is simply absent. The
// settings panels call it from inside a `requestAnimationFrame` callback to
// reveal a just-created one-time secret — a place React cannot catch a throw,
// so the failure surfaces as an unhandled exception attributed to whichever
// test happened to be running. A no-op is the whole fix.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

afterEach(() => {
  cleanup();
});
