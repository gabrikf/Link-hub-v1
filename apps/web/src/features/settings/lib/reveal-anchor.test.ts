import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listenForAnchorClicks,
  revealAnchorTarget,
  revealAndScrollTo,
} from "./reveal-anchor";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("revealAnchorTarget", () => {
  it("opens every collapsed <details> between the target and the root", () => {
    document.body.innerHTML = `
      <details id="outer">
        <summary>Advanced settings</summary>
        <details id="inner">
          <summary>Manual setup</summary>
          <section id="target">panel</section>
        </details>
      </details>
    `;

    expect(revealAnchorTarget("target")).toBe(
      document.getElementById("target"),
    );
    expect(document.querySelector("#outer")).toHaveAttribute("open");
    expect(document.querySelector("#inner")).toHaveAttribute("open");
  });

  it("returns null for a fragment that matches nothing", () => {
    expect(revealAnchorTarget("nope")).toBeNull();
  });

  it("scrolls the revealed target into view", () => {
    document.body.innerHTML = `<details id="d"><section id="target"></section></details>`;
    const target = document.getElementById("target") as HTMLElement;
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;

    expect(revealAndScrollTo("target")).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
  });
});

describe("listenForAnchorClicks", () => {
  it("reveals the target of a same-page link instead of scrolling to a closed box", () => {
    document.body.innerHTML = `
      <a id="link" href="#target">Go</a>
      <details id="d"><section id="target"></section></details>
    `;
    const stop = listenForAnchorClicks();

    document.getElementById("link")?.click();

    expect(document.querySelector("#d")).toHaveAttribute("open");
    stop();
  });

  it("leaves unresolved fragments and outbound links alone", () => {
    document.body.innerHTML = `
      <a id="missing" href="#nowhere">Go</a>
      <a id="away" href="https://example.com">Away</a>
    `;
    const stop = listenForAnchorClicks();

    const missing = document.getElementById("missing") as HTMLAnchorElement;
    const missingEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    missing.dispatchEvent(missingEvent);
    expect(missingEvent.defaultPrevented).toBe(false);

    const away = document.getElementById("away") as HTMLAnchorElement;
    const awayEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    away.dispatchEvent(awayEvent);
    expect(awayEvent.defaultPrevented).toBe(false);

    stop();
  });

  it("stops listening once torn down", () => {
    document.body.innerHTML = `
      <a id="link" href="#target">Go</a>
      <details id="d"><section id="target"></section></details>
    `;
    const stop = listenForAnchorClicks();
    stop();

    document.getElementById("link")?.click();

    expect(document.querySelector("#d")).not.toHaveAttribute("open");
  });
});
