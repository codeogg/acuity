// @vitest-environment jsdom
// Testing Library harness proof over the shared component surface: the shared
// Button renders accessibly (role, accessible name, disabled semantics).

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { Button } from "@acuity/ui";

describe("shared Button", () => {
  it("renders an accessible button", () => {
    render(createElement(Button, null, "Submit claim"));
    const button = screen.getByRole("button", { name: "Submit claim" });
    expect(button).toBeTruthy();
  });

  it("exposes disabled state", () => {
    render(createElement(Button, { disabled: true }, "Locked"));
    const button = screen.getByRole("button", { name: "Locked" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
