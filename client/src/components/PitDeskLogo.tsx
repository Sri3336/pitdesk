/**
 * PitDesk Logo — uses the uploaded brand image (A shape + shark fin + candlesticks)
 */
export function PitDeskLogo({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src="/brand-assets/pitdesk-icon-v3.png"
      width={size}
      height={size}
      alt="PitDesk logo"
      className={className}
      style={{
        objectFit: "contain",
        display: "block",
        borderRadius: 6,
      }}
    />
  );
}
