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

/** 卡面底色，用于图标中的镂空细节 */
const CUT = { fill: 'var(--card-face)' };

/** 人头牌图标：J 羽毛帽、Q 圆珠冠、K 十字王冠（取代重复的字母，避免与左上角点数重复） */
export function CourtIcon({ rank, className }: { rank: number; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" fill="currentColor">
      {rank === 13 && (
        <>
          <path d="M50 2h5v7h7v5h-7v8h-5v-8h-7V9h7z" />
          <path d="M15 74 9 33l21 17 20-27 20 27 21-17-6 41z" />
          <circle cx="9" cy="29" r="5" />
          <circle cx="91" cy="29" r="5" />
          <rect x="15" y="78" width="70" height="10" rx="2.5" />
          <circle cx="50" cy="60" r="5.5" style={CUT} />
          <circle cx="31" cy="64" r="3" style={CUT} />
          <circle cx="69" cy="64" r="3" style={CUT} />
          <rect x="21" y="81.5" width="58" height="3" rx="1.5" style={CUT} />
        </>
      )}
      {rank === 12 && (
        <>
          <path d="M13 74c0-13 2-26 5-36l15 17 17-21 17 21 15-17c3 10 5 23 5 36z" />
          <circle cx="18" cy="32" r="6" />
          <circle cx="50" cy="26" r="7" />
          <circle cx="82" cy="32" r="6" />
          <circle cx="33" cy="50" r="3.5" />
          <circle cx="67" cy="50" r="3.5" />
          <rect x="13" y="78" width="74" height="10" rx="5" />
          <path d="M50 52c5 5 8 8 8 12a8 8 0 0 1-16 0c0-4 3-7 8-12z" style={CUT} />
          <circle cx="27" cy="83" r="2.5" style={CUT} />
          <circle cx="50" cy="83" r="2.5" style={CUT} />
          <circle cx="73" cy="83" r="2.5" style={CUT} />
        </>
      )}
      {rank === 11 && (
        <>
          <path d="M64 46C70 27 82 14 98 7c-3 15-11 28-24 41z" />
          <path
            d="M66 45C74 31 84 20 95 11"
            fill="none"
            strokeWidth="2.2"
            style={{ stroke: 'var(--card-face)' }}
          />
          <path d="M27 67c0-19 10-30 24-30s24 11 24 30z" />
          <path d="M5 73c0-8 20-12 45-12s45 4 45 12-20 11-45 11S5 81 5 73z" />
          <rect x="27" y="59" width="48" height="5" style={CUT} />
          <circle cx="50" cy="73" r="3" style={CUT} />
        </>
      )}
    </svg>
  );
}

/** 王牌图标：星芒（与人头牌的王冠明显区分） */
export function JesterIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" fill="currentColor">
      <path d="M46 14c4 29 8 35 38 42-30 7-34 13-38 42-4-29-8-35-38-42 30-7 34-13 38-42z" />
      <path d="M84 6c1.6 9.5 3 11 12 13-9 2-10.4 3.5-12 13-1.6-9.5-3-11-12-13 9-2 10.4-3.5 12-13z" />
      <circle cx="46" cy="56" r="6" style={CUT} />
    </svg>
  );
}
