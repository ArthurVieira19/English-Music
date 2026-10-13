import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

const STAR_COUNT = 5;

/**
 * Read-only star rating in half-star steps (0 to 5). The accessible name
 * carries the number, so the stars themselves stay decorative.
 */
export function StarRating({ value, className }: { value: number; className?: string }) {
  const clamped = Math.min(STAR_COUNT, Math.max(0, value));

  return (
    <span role="img" aria-label={`${clamped} out of ${STAR_COUNT} stars`} className={cn("inline-flex gap-1", className)}>
      {Array.from({ length: STAR_COUNT }, (_, index) => {
        const filled = Math.min(1, Math.max(0, clamped - index));
        return (
          <span key={index} aria-hidden className="relative inline-block size-7 shrink-0">
            <Star className="absolute inset-0 size-7 text-muted-foreground/35" />
            {filled > 0 && (
              <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${filled * 100}%` }}>
                <Star className="size-7 fill-amber-400 text-amber-400" />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
