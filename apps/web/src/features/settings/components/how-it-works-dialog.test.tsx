import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HowItWorksDialog } from "./how-it-works-dialog";

describe("HowItWorksDialog", () => {
  it("renders nothing until opened", () => {
    render(<HowItWorksDialog open={false} onOpenChange={vi.fn()} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the three-panel pipeline with the local-first framing", () => {
    render(<HowItWorksDialog open onOpenChange={vi.fn()} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Your machine")).toBeInTheDocument();
    expect(screen.getByText("Sanitizer")).toBeInTheDocument();
    expect(screen.getByText("LinkHub")).toBeInTheDocument();
    expect(
      screen.getByText(/Code never leaves your machine/),
    ).toBeInTheDocument();
  });

  it("shows a real sample payload and the matching never-leaves list", () => {
    const { baseElement } = render(
      <HowItWorksDialog open onOpenChange={vi.fn()} />,
    );

    const codeText = Array.from(baseElement.querySelectorAll("pre"))
      .map((el) => el.textContent ?? "")
      .join("\n");

    // Shaped exactly like ingestActivityEventSchemaInput — hashes, a date, a
    // bounded payload. No repo name anywhere.
    expect(codeText).toContain('"externalDeliveryId"');
    expect(codeText).toContain('"repoFingerprint"');
    expect(codeText).toContain('"occurredOn": "2026-08-10"');
    expect(codeText).toContain('"changedFiles": 7');
    expect(codeText).not.toContain("repoName");

    expect(screen.getByText("What never leaves")).toBeInTheDocument();
    expect(screen.getByText("Commit messages")).toBeInTheDocument();
    expect(screen.getByText("Code")).toBeInTheDocument();
    expect(
      screen.getByText(/dates only, so nothing publishes when you sleep/),
    ).toBeInTheDocument();
  });

  it("keeps the deep layers behind collapsed disclosures", () => {
    const { baseElement } = render(
      <HowItWorksDialog open onOpenChange={vi.fn()} />,
    );

    const detailsElements = baseElement.querySelectorAll("details");
    expect(detailsElements.length).toBeGreaterThanOrEqual(3);
    for (const details of detailsElements) {
      expect(details).not.toHaveAttribute("open");
    }

    // The enforced-vs-guidance grid and the weak/strong examples are the SAME
    // shared components the connect panel renders — spot-check their copy.
    expect(screen.getByText("Enforced by LinkHub")).toBeInTheDocument();
    expect(
      screen.getByText(/Guidance to the model — not a guarantee/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/outcome, impact, stack/i),
    ).toBeInTheDocument();
  });

  it("answers the two questions users actually hesitate on", () => {
    render(<HowItWorksDialog open onOpenChange={vi.fn()} />);

    // Commit-message quality is the most common reason a developer assumes
    // this feature is not for them; the pipeline never reads them at all.
    expect(
      screen.getByText(/Write bad commit messages\? Doesn't matter\./),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/never read your commit messages, branch names/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/zero work to your day/i),
    ).toBeInTheDocument();

    expect(
      screen.getByText(/Can this hurt you\? What's the catch\?/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Nothing publishes without you/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/blocked on our servers, not by a promise/i),
    ).toBeInTheDocument();
  });

  it("states why an employer is safe, without overpromising", () => {
    render(<HowItWorksDialog open onOpenChange={vi.fn()} />);

    expect(screen.getByText("Why your employer is safe")).toBeInTheDocument();
    expect(
      screen.getByText(/check your company.s tooling policy/i),
    ).toBeInTheDocument();
  });
});
