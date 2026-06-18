/**
 * PitDesk Logo — Shark Fin "A"
 *
 * Design: A shark fin silhouette that also reads as the letter A.
 * - Very steep, narrow left edge (the leading edge of the fin)
 * - Deep concave scoop on the right (the trailing edge of the fin)
 * - Two legs at the bottom with a clear gap between them
 * - A horizontal crossbar punched through at mid-height
 *
 * The shape is built as a single compound path:
 *   Outer shape: left leg → peak → right concave curve → right leg → baseline
 *   Inner cutout: the crossbar gap is a separate green rect overlay
 */
export function PitDeskLogo({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="PitDesk logo"
    >
      {/* Green rounded-square background */}
      <rect width="32" height="32" rx="7" fill="#22c55e" />

      {/*
        Shark fin / A outer silhouette:

        Left leg (steep, narrow):
          Start at bottom-left foot: (7, 27)
          Go straight up to peak: (13, 4)   ← very steep left edge

        Right trailing edge (deep concave scoop):
          From peak (13, 4) curve to bottom-right foot (25, 27)
          Using cubic bezier with control points that pull the curve
          far to the LEFT, creating a deep concave scoop:
            C (13, 10) (10, 18) (25, 27)
          This makes the right side bow inward dramatically.

        Bottom: close back along baseline (25,27) → (7,27)
      */}
      <path
        d="M 7 27 L 13 4 C 14 10 11 18 25 27 Z"
        fill="white"
      />

      {/*
        A crossbar — green rect punched through the white fin.
        At y=18, the left edge of the fin is at ~x=9.5
        and the right curve is at ~x=18.5
      */}
      <rect x="9.5" y="17" width="9" height="2.5" rx="1.25" fill="#22c55e" />

      {/*
        Bottom gap between the two legs — green rect to separate
        the left and right feet so it reads as two distinct A legs.
        The gap sits at the very bottom between x=13 and x=19.
      */}
      <rect x="13.5" y="23" width="5" height="4.5" rx="0" fill="#22c55e" />
    </svg>
  );
}
