import { notFound } from "next/navigation";

// Catch-all for unknown paths inside a valid locale segment: delegates to the
// locale not-found boundary so the 404 renders localised and inside the site
// chrome (header/footer), instead of falling through to the bare root 404.
export default function CatchAllPage() {
  notFound();
}
