"use client";

import { cn } from "@/lib/cn";
import { useEffect, useRef, type ReactNode } from "react";

// Scroll-entrance reveal (opacity + translate on first view only). Progressive:
// the server render is fully visible; on mount the element is hidden only when
// it starts below the fold and reduced motion is off, then revealed once it
// intersects. No-JS and reduced-motion renders never hide content.
export function Reveal({
  children,
  delay,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    el.classList.add("reveal-hidden");
    const io = new IntersectionObserver(
      (entries) => {
        // Reveal on intersection, and also when the element has been jumped
        // past (fully above the viewport) so a fast scroll never strands
        // content at opacity 0.
        if (
          entries.some((e) => e.isIntersecting || e.boundingClientRect.top < 0)
        ) {
          el.classList.remove("reveal-hidden");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("reveal", className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
