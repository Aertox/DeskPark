/** 闲亭品牌标志：极简的亭子轮廓 */
export function PavilionMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      fill="currentColor"
    >
      <circle cx="24" cy="5" r="2.4" />
      <path d="M3 19c6-.5 12-3.5 16.5-9.5L24 6.5l4.5 3c4.5 6 10.5 9 16.5 9.5-5.5 2-36.5 2-42 0z" />
      <rect x="9" y="21.5" width="30" height="3" rx="1.5" />
      <rect x="12" y="24.5" width="3" height="14" />
      <rect x="33" y="24.5" width="3" height="14" />
      <rect x="15" y="32" width="18" height="2" />
      <rect x="6" y="38.5" width="36" height="3.5" rx="1.5" />
    </svg>
  );
}
