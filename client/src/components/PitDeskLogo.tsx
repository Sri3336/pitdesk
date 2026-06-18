/**
 * PitDesk Shark Fin "A" Logo
 * An A-shaped shark fin silhouette in green — the PitDesk brand mark.
 * Usage: <PitDeskLogo size={32} />
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
      {/* Rounded square background */}
      <rect width="32" height="32" rx="7" fill="#22c55e" />
      {/*
        Shark fin "A" shape:
        - Two outer legs rising to a sharp central peak (the fin tip)
        - A horizontal crossbar (the A crossbar / waterline)
        - The right side has a concave scoop (shark fin trailing edge)
      */}
      <path
        d={[
          // Left outer leg — bottom-left up to peak
          "M 6 26",
          "L 14.5 8",
          // Peak — sharp fin tip
          "L 16 5.5",
          // Right side — shark fin concave trailing edge
          "L 17.5 8",
          // Curve inward (concave scoop of fin)
          "Q 20 13 22 16",
          // Continue down right outer leg
          "L 26 26",
          // Bottom right corner
          "Z",
        ].join(" ")}
        fill="white"
        opacity="0.95"
      />
      {/* Crossbar — the "A" horizontal bar, also the waterline */}
      <rect x="10.5" y="19" width="9" height="2" rx="1" fill="#22c55e" />
    </svg>
  );
}
