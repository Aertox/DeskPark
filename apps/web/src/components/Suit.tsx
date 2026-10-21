import type { Suit as SuitType } from '@park/engine';

/** 花色矢量图形：跨平台一致（避免 Unicode 花色在部分手机上被渲染成 emoji）。 */
const PATHS: Record<Exclude<SuitType, 'J'>, string> = {
  H: 'M50 90C22 68 5 51 5 31 5 16 16 6 30 6c9 0 16 5 20 13 4-8 11-13 20-13 14 0 25 10 25 25 0 20-17 37-45 59z',
  D: 'M50 3c11 17 24 32 39 47-15 15-28 30-39 47C39 80 26 65 11 50 26 35 39 20 50 3z',
  S: 'M50 4c13 19 43 33 43 57 0 14-10 22-22 22-8 0-14-4-17-10 1 10 5 17 13 22H33c8-5 12-12 13-22-3 6-9 10-17 10C17 83 7 75 7 61 7 37 37 23 50 4z',
  C: 'M50 7a19 19 0 0 1 15 30.6A19 19 0 1 1 55.5 70c1.3 10 5 18.5 13.5 24h-38c8.5-5.5 12.2-14 13.5-24A19 19 0 1 1 35 37.6 19 19 0 0 1 50 7z',
};

export function SuitIcon({
  suit,
  size = '1em',
  className,
}: {
  suit: SuitType;
  size?: string | number;
  className?: string;
}) {
  if (suit === 'J') return null;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden="true">
      <path d={PATHS[suit]} fill="currentColor" />
    </svg>
  );
}

export function CrownIcon({ size = '1em' }: { size?: string | number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <path
        d="M12 74 6 30l24 18 20-32 20 32 24-18-6 44z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <rect x="12" y="80" width="76" height="8" rx="3" fill="currentColor" />
      <circle cx="6" cy="28" r="5" fill="currentColor" />
      <circle cx="50" cy="13" r="5" fill="currentColor" />
      <circle cx="94" cy="28" r="5" fill="currentColor" />
    </svg>
  );
}
