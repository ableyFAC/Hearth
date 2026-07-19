"use client";

import { useEffect, useState } from "react";
import { Camera } from "lucide-react";

// A phone-only "Take photo" affordance that sits NEXT TO an existing gallery
// picker, never instead of it. capture="environment" makes mobile browsers
// open the camera (rear lens) directly instead of the photo library.
//
// The deny/cancel path is graceful by construction: the browser owns the
// camera permission prompt, and if the owner denies it or backs out, the
// change event simply never fires. The regular gallery picker is still right
// there, so there is no dead end and nothing to catch.
//
// Desktop stays unchanged: this renders nothing unless the device is
// touch-first (coarse pointer, no hover), so mouse users never see a
// redundant second button, and browsers that ignore `capture` are never
// handed one.
export default function TakePhotoButton({
  onPick,
  disabled,
  label = "Take a photo",
  className = "",
}: {
  // The same change handler the gallery input uses, so both paths share one
  // upload/extract pipeline.
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    // Checked in an effect so the server render matches the first client
    // render (no hydration mismatch).
    setIsTouch(
      window.matchMedia("(hover: none) and (pointer: coarse)").matches
    );
  }, []);

  if (!isTouch) return null;

  return (
    <label
      className={`btn-secondary ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      } ${className}`}
    >
      <Camera className="mr-1.5 inline-block h-4 w-4" aria-hidden="true" />
      {label}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onPick}
        disabled={disabled}
        className="sr-only"
      />
    </label>
  );
}
