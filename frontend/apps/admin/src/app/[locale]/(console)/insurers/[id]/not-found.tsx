import { NotFoundState } from "@/components/ui/not-found-state";

export default function NotFound() {
  return (
    <NotFoundState
      titleKey="insurer.title"
      descriptionKey="insurer.description"
      backHref="/insurers"
      backLabelKey="insurer.back"
    />
  );
}
