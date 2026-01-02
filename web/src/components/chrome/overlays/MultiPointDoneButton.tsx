import { Button } from "@/components/ui/button";
import { CheckIcon } from "lucide-react";

interface MultiPointDoneButtonProps {
  /** Called when user taps Done to finalize the multi-point shape */
  onFinalize: () => void;
}

/**
 * Floating "Done" button shown when user is drawing a multi-point line/arrow
 * (tap-tap mode). Positioned at the bottom center of the screen.
 */
export function MultiPointDoneButton({ onFinalize }: MultiPointDoneButtonProps) {
  return (
    <div
      className="fixed z-30 pointer-events-auto"
      style={{ bottom: 100, left: "50%", transform: "translateX(-50%)" }}
    >
      <Button
        variant="default"
        size="lg"
        className="h-12 px-6 text-base font-medium bg-blue-600 hover:bg-blue-700 text-white border-0 shadow-lg"
        onClick={onFinalize}
      >
        <CheckIcon className="mr-2 size-5" />
        Done
      </Button>
    </div>
  );
}
