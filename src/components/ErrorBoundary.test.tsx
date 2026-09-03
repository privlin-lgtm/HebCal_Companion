import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { ErrorBoundary } from "./ErrorBoundary";

function GoodComponent() {
  return <div>All good</div>;
}

function BadComponent(): ReactElement {
  throw new Error("test error");
}

describe("ErrorBoundary", () => {
  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <GoodComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText("All good")).toBeDefined();
  });

  it("renders fallback when child throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <BadComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText("This section is temporarily unavailable.")).toBeDefined();
    spy.mockRestore();
  });

  it("renders custom fallback when provided", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <BadComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Custom fallback")).toBeDefined();
    spy.mockRestore();
  });
});
