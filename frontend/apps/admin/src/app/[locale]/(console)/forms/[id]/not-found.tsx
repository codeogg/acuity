import { NotFoundState } from "@/components/ui/not-found-state";

export default function NotFound() {
  return (
    <NotFoundState
      titleKey="template.title"
      descriptionKey="template.description"
      backHref="/forms"
      backLabelKey="template.back"
    />
  );
}
