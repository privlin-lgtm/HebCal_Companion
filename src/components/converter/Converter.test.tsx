import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppProvider } from "../../context/AppContext";
import { createServices } from "../../composition";
import { Converter } from "./Converter";

function renderConverter() {
  return render(
    <AppProvider services={createServices()}>
      <Converter />
    </AppProvider>,
  );
}

describe("Converter", () => {
  it("renders both tabs", () => {
    renderConverter();
    expect(screen.getByText("Gregorian to Hebrew")).toBeDefined();
    expect(screen.getByText("Hebrew to Gregorian")).toBeDefined();
  });

  it("shows the Gregorian form by default", () => {
    renderConverter();
    expect(screen.getByLabelText("Gregorian date")).toBeDefined();
  });

  it("switches to Hebrew form on tab click", () => {
    renderConverter();
    fireEvent.click(screen.getByText("Hebrew to Gregorian"));
    expect(screen.getByLabelText("Hebrew month")).toBeDefined();
  });

  it("renders the result empty state", () => {
    renderConverter();
    expect(screen.getByText("Choose a date to begin")).toBeDefined();
  });
});
