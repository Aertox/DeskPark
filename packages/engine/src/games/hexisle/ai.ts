import { withRecommended } from '../../core/ai';
import type { Rng } from '../../core/rng';
import type { AiOption, AiPrompt, Seat } from '../../core/types';
import { hiBot, vertexScore } from './bot';
import { EDGES, VERT_HEXES } from './geometry';
import { canPay, citySpots, roadSpots, settlementSpots, tradeRates } from './rules';
import type { HiAction, HiView, ResMap } from './shared';
import { COST, DEV_NAME, PIECES, RESOURCES, RES_NAME, TERRAIN_NAME } from './shared';

const resText = (m: ResMap | null) =>
  m
    ? RESOURCES.filter((r) => m[r])
        .map((r) => `${RES_NAME[r]}×${m[r]}`)
        .join('、') || '（无）'
    : '?';

/** 路口周围的地形，例如「麦田6、山脉8」 */
function spotText(view: HiView, v: number): string {
  return (
    VERT_HEXES[v]
      .map((h) => view.hexes[h])
      .map((h) => (h.num ? `${TERRAIN_NAME[h.terrain]}${h.num}` : TERRAIN_NAME[h.terrain]))
      .join('、') || '海边'
  );
}

export function hiAiPrompt(view: HiView, seat: Seat, rng: Rng): AiPrompt<HiAction> | null {
  // 弃牌、回应交易这类小决定交给规则电脑
  if (view.phase === 'discard' || view.phase === 'over' || view.trade) return null;
  if (view.turn !== seat) return null;
  const me = view.players[seat];
  const lines = [
    '卡旦岛（六边形拓荒）：用资源修路、建村庄（1 分）、升级城市（2 分）、买发展卡；最长道路与最大军队各 2 分，' +
      `先到 ${view.options.target} 分获胜。村庄之间至少隔两段路。`,
    `你：${me.vpTotal ?? me.vp} 分，手牌 ${resText(me.hand)}，发展卡 ${me.devs?.map((d) => DEV_NAME[d.kind]).join('、') || '无'}，骑士 ${me.knights}，最长道路 ${me.roadLength}。`,
  ];
  view.players.forEach((p, s) => {
    if (s !== seat)
      lines.push(
        `${s + 1} 号玩家：${p.vp} 分，手牌 ${p.cards} 张，发展卡 ${p.devCount} 张，骑士 ${p.knights}，最长道路 ${p.roadLength}`,
      );
  });
  const rates = tradeRates(view, seat);
  lines.push(`你的兑换比例：${RESOURCES.map((r) => `${RES_NAME[r]} ${rates[r]}:1`).join('，')}`);

  const options: AiOption<HiAction>[] = [];
  const top = (spots: number[], k: number) =>
    [...spots].sort((a, b) => vertexScore(view, b, seat) - vertexScore(view, a, seat)).slice(0, k);
  switch (view.phase) {
    case 'setup':
      if (view.setupVertex === null) {
        for (const v of top(settlementSpots(view, seat, true), 6))
          options.push({
            label: `把村庄放在 ${spotText(view, v)} 的路口`,
            action: { type: 'settle', at: v },
          });
      } else {
        for (const e of roadSpots(view, seat)) {
          const far = EDGES[e][0] === view.setupVertex ? EDGES[e][1] : EDGES[e][0];
          options.push({
            label: `修路通往 ${spotText(view, far)}`,
            action: { type: 'road', at: e },
          });
        }
      }
      break;
    case 'roll':
      options.push({ label: '掷骰子', action: { type: 'roll' } });
      if (!view.devPlayed && me.devs?.some((d) => d.kind === 'knight' && d.bought < view.turnNo))
        options.push({ label: '先打出骑士（移动强盗）', action: { type: 'dev', kind: 'knight' } });
      break;
    case 'robber':
    case 'roadBuilding':
      break;
    case 'main': {
      const hand = me.hand!;
      if (me.cities < PIECES.city && canPay(hand, COST.city))
        for (const v of top(citySpots(view, seat), 3))
          options.push({
            label: `把 ${spotText(view, v)} 的村庄升级为城市`,
            action: { type: 'city', at: v },
          });
      if (me.settlements < PIECES.settlement && canPay(hand, COST.settlement))
        for (const v of top(settlementSpots(view, seat, false), 3))
          options.push({
            label: `在 ${spotText(view, v)} 建村庄`,
            action: { type: 'settle', at: v },
          });
      if (view.devLeft > 0 && canPay(hand, COST.dev))
        options.push({ label: '买一张发展卡', action: { type: 'buy' } });
      for (const give of RESOURCES) {
        if (hand[give] < rates[give]) continue;
        for (const get of RESOURCES)
          if (get !== give && view.bank[get] > 0)
            options.push({
              label: `用 ${rates[give]} 张${RES_NAME[give]}向银行换 1 张${RES_NAME[get]}`,
              action: { type: 'bank', give, get },
            });
      }
      options.push({ label: '结束回合', action: { type: 'end' } });
      break;
    }
  }
  if (!options.length) return null;
  const rec = hiBot(view, seat, rng);
  return { situation: lines.join('\n'), options: withRecommended(rec, options) };
}
