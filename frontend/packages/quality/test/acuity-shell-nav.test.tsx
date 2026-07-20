// @vitest-environment jsdom
// Coverage for the shared shell nav row (ShellNavItem): the native count-chip
// slot renders alongside the label, and the avatar helper keeps CJK-aware
// initials (the bilingual-product rule the per-app forks had drifted on).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Avatar, ShellNavRow, avatarInitials } from "@acuity/ui";

afterEach(cleanup);

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-HK/clinics",
}));

// Plain anchor stand-in: the app-router context next/link expects is not
// mounted in a unit render.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("ShellNavRow", () => {
  it("renders the label with a count chip when count is set", () => {
    render(
      <ShellNavRow
        item={{ href: "/en-HK/clinics", label: "Clinics", count: 12 }}
        active
      />,
    );
    const link = screen.getByRole("link", { name: /Clinics/ });
    expect(link.getAttribute("aria-current")).toBe("page");
    expect(link.textContent).toContain("12");
  });

  it("renders without a chip when count is absent", () => {
    render(<ShellNavRow item={{ href: "/en-HK/forms", label: "Forms" }} active={false} />);
    const link = screen.getByRole("link", { name: "Forms" });
    expect(link.getAttribute("aria-current")).toBeNull();
  });
});

describe("Avatar initials", () => {
  it("prefers the first CJK character on bilingual names", () => {
    expect(avatarInitials("陳美玲 Chan Mei Ling")).toBe("陳");
  });

  it("takes first + last Latin initials otherwise", () => {
    expect(avatarInitials("Chan Mei Ling")).toBe("CL");
  });

  it("renders the initials aria-hidden (adjacent text carries the name)", () => {
    const { container } = render(<Avatar name="Chan Mei Ling" size={32} />);
    const span = container.querySelector("span[aria-hidden]");
    expect(span?.textContent).toBe("CL");
  });
});
