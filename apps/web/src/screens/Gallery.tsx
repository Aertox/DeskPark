import { mj } from '@park/engine';
import { MahjongTile } from '../components/MahjongTile';
import { PlayingCard } from '../components/PlayingCard';
import { CHARACTERS } from '../components/pixel/characters';
import { PixelArt, PixelAvatar } from '../components/pixel/PixelAvatar';

/** 开发用：牌面一览（仅开发环境可访问 #/gallery） */
export default function Gallery() {
  const tiles = mj.MJ_SUITS.flatMap((suit) =>
    Array.from({ length: 9 }, (_, i) => mj.tileOf(mj.suitIndex(suit) * 36 + i * 4)),
  );
  return (
    <div className="table" style={{ overflow: 'auto', padding: 24 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        {CHARACTERS.map((c) => (
          <div key={c.id} style={{ textAlign: 'center', fontSize: 11 }}>
            <div style={{ width: 112, height: 112, background: c.bg, borderRadius: 12 }}>
              <PixelArt character={c} />
            </div>
            {c.name}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
        {CHARACTERS.map((c) => (
          <PixelAvatar key={c.id} avatar={c.id} name={c.name} size={44} />
        ))}
      </div>
      {[64, 36, 20].map((w) => (
        <div key={w} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
          {tiles.map((t) => (
            <MahjongTile key={t.id} tile={t} w={`${w}px`} />
          ))}
          <MahjongTile faceDown w={`${w}px`} />
          <MahjongTile tile={tiles[3]} w={`${w}px`} selected />
          <MahjongTile tile={tiles[20]} w={`${w}px`} que dim />
          <MahjongTile tile={tiles[11]} w={`${w}px`} highlight />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8 }}>
        {[11, 12, 13, 14].map((r) => (
          <PlayingCard key={r} card={{ id: r, suit: 'S', rank: r }} w="70px" />
        ))}
      </div>
    </div>
  );
}
