import { Shimmer } from "@acuity/ui";
import { CardSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  return (
    <div className="px-6 py-6">
      <Shimmer className="mb-6 h-8 w-48" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {[190, 190, 190, 260, 260].map((h, i) => (
          <CardSkeleton key={i} height={h} />
        ))}
      </div>
    </div>
  );
}
