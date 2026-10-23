import Link from "@/components/ui/IntentLink";
import { BLACK_PATH } from "@/lib/black";

/** A small red square in the public footers. No label on screen; screen readers get a hint. */
export function BlackDot() {
  return (
    <Link
      href={BLACK_PATH}
      aria-label="Something is coming"
      className="group inline-flex size-11 items-center justify-center rounded-sm outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e01b24] lg:size-6"
    >
      <span
        aria-hidden
        className="size-1.5 bg-[#c1121f] opacity-70 transition-all group-hover:scale-150 group-hover:opacity-100"
      />
    </Link>
  );
}
