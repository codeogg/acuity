import { NotFoundState } from "@/components/ui/not-found-state";

export default function NotFound() {
  return (
    <NotFoundState
      titleKey="claim.title"
      descriptionKey="claim.description"
      backHref="/claims"
      backLabelKey="claim.back"
    />
  );
}
