// @vitest-environment jsdom
// Interaction coverage for the shared ops-grid keyboard layer
// (useOpsGridKeyboardNav): j/k and arrow keys traverse row focus targets,
// x toggles the row's bulk-selection checkbox, and the keys stay inert while
// a form control owns focus.

import { afterEach, describe, expect, it } from "vitest";
import { useRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useOpsGridKeyboardNav } from "@acuity/ui";

afterEach(cleanup);

function Grid() {
  const ref = useRef<HTMLDivElement>(null);
  useOpsGridKeyboardNav(ref);
  return (
    <div ref={ref}>
      <table>
        <tbody>
          {["one", "two", "three"].map((row) => (
            <tr key={row}>
              <td>
                <button role="checkbox" aria-checked="false" aria-label={`select ${row}`}>
                  {" "}
                </button>
              </td>
              <td>{row === "one" ? <input aria-label="inline edit" /> : null}</td>
              <td>
                <a href={`/rows/${row}`}>{`open ${row}`}</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

describe("useOpsGridKeyboardNav", () => {
  it("moves focus across row targets with j/k and arrows", () => {
    render(<Grid />);
    const first = screen.getByRole("link", { name: "open one" });
    first.focus();

    fireEvent.keyDown(first, { key: "j" });
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "open two" }));

    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "open three" }),
    );

    // Clamped at the last row.
    fireEvent.keyDown(document.activeElement!, { key: "j" });
    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "open three" }),
    );

    fireEvent.keyDown(document.activeElement!, { key: "k" });
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "open two" }));
  });

  it("toggles the row checkbox with x", () => {
    render(<Grid />);
    const link = screen.getByRole("link", { name: "open one" });
    const checkbox = screen.getByRole("checkbox", { name: "select one" });
    let clicks = 0;
    checkbox.addEventListener("click", () => {
      clicks += 1;
    });
    link.focus();
    fireEvent.keyDown(link, { key: "x" });
    expect(clicks).toBe(1);
  });

  it("stays inert while a form control owns focus", () => {
    render(<Grid />);
    const input = screen.getByRole("textbox", { name: "inline edit" });
    input.focus();
    fireEvent.keyDown(input, { key: "j" });
    expect(document.activeElement).toBe(input);
  });
});
