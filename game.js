// ============================================================
// 王への請願 (To Court the King) - ゲームロジック
// カード19種の定義・取得条件判定
// ============================================================

// ---- ダイス集計ユーティリティ ----
function counts(dice) {
  const c = {};
  dice.forEach(v => { c[v] = (c[v] || 0) + 1; });
  return c;
}

function sum(dice) {
  return dice.reduce((a, b) => a + b, 0);
}

// 同目n個以上があるか（フォーカードは4ペア扱いにもなるため maxCount で判定）
function hasKind(dice, n) {
  const c = counts(dice);
  return Object.values(c).some(v => v >= n);
}

// 同目ちょうどn個の「組」がいくつあるか（4つは2ペア扱いにもなる特例あり）
function countGroupsOfSize(dice, n) {
  const c = counts(dice);
  let groups = 0;
  Object.values(c).forEach(v => {
    groups += Math.floor(v / n);
  });
  return groups;
}

// ペア(2個組)が指定数以上あるか。同目4つは2ペアとして扱う特例を含む
function hasPairsAtLeast(dice, n) {
  const c = counts(dice);
  let pairCount = 0;
  Object.values(c).forEach(v => {
    pairCount += Math.floor(v / 2); // 同目4つ→2ペア、同目6つ→3ペア
  });
  return pairCount >= n;
}

// 「ペア1組＋スリーカード1組」（例:22555, 11166）
function hasPairAndTriple(dice) {
  const c = counts(dice);
  const vals = Object.values(c);
  const hasTriple = vals.some(v => v >= 3);
  const hasPair = vals.some(v => v >= 2 && v !== undefined) &&
    // 3以上のvalueを1つ使った上で、別の2以上のvalueが残っているか
    (() => {
      const arr = [...vals];
      const tIdx = arr.findIndex(v => v >= 3);
      if (tIdx === -1) return false;
      arr[tIdx] -= 3;
      return arr.some((v, i) => (i === tIdx ? v >= 2 : v >= 2));
    })();
  return hasTriple && hasPair;
}

// 「スリーカードが2組」（例:111222）
function hasTwoTriples(dice) {
  return countGroupsOfSize(dice, 3) >= 2;
}

// 全て奇数 / 全て偶数
function allOdd(dice) { return dice.every(v => v % 2 === 1); }
function allEven(dice) { return dice.every(v => v % 2 === 0); }

// ストレート判定：確定ダイスの中に 1-2-3-4-5 または 2-3-4-5-6 がすべて含まれるか
function hasStraight5(dice) {
  const set = new Set(dice);
  const low = [1, 2, 3, 4, 5].every(v => set.has(v));
  const high = [2, 3, 4, 5, 6].every(v => set.has(v));
  return low || high;
}

// フルストレート：1-2-3-4-5-6 すべて含まれる
function hasFullStraight(dice) {
  const set = new Set(dice);
  return [1, 2, 3, 4, 5, 6].every(v => set.has(v));
}

// ============================================================
// カード定義（19種）
// id, name, group(0/I/II/III/IV/V), reqText, checkFn, effectText, effectType
// effectType: 'reroll_one' | 'add_die' | 'modify' | 'extra_at_start' | 'win' などUI/game向けタグ
// ============================================================
const CARDS = [
  // --- 0コスト ---
  {
    id: "fool",
    name: "道化師",
    group: "0",
    reqText: "どんな目でも可（未所持の場合のみ）",
    effectText: "未確定のダイス1つを振りなおすことができる",
    effectType: "reroll_one",
    // 道化師の判定は「他のどのカードにも該当しない(豚)」場合の救済枠として
    // main.js側の判定優先順位ロジックで特別扱いする。
    // ここでは「常にtrueを返せる」カードとして定義するが、実際の付与は
    // 「他に該当カードがない、かつ道化師未所持」の場合のみ候補に出す。
    check: (dice) => true,
    specialRule: "fool"
  },
  {
    id: "charlatan",
    name: "ペテン師",
    group: "0",
    reqText: "どんな目でも可（道化師所持時のみ、道化師と入れ替わる）",
    effectText: "手番の最初に振るダイスが1つ追加される",
    effectType: "extra_at_start",
    check: (dice) => true,
    specialRule: "charlatan" // 道化師所持が前提。取得すると道化師が消え、ペテン師になる
  },

  // --- I（3ダイスで取得可）---
  {
    id: "farmer",
    name: "農夫",
    group: "I",
    reqText: "2つのダイスの目が同じ（ペア）",
    effectText: "手番の最初に振るダイスが1つ追加される",
    effectType: "extra_at_start",
    check: (dice) => hasKind(dice, 2)
  },
  {
    id: "maid",
    name: "下女",
    group: "I",
    reqText: "ダイスの目が全て奇数",
    effectText: "未確定のダイス1つの目に+1～+3できる",
    effectType: "modify",
    check: (dice) => allOdd(dice)
  },
  {
    id: "philosopher",
    name: "哲学者",
    group: "I",
    reqText: "ダイスの目が全て偶数",
    effectText: "2つのダイスの目をその和を変えない範囲で変更できる",
    effectType: "modify",
    check: (dice) => allEven(dice)
  },
  {
    id: "artisan",
    name: "職人",
    group: "I",
    reqText: "ダイスの目の合計が15以上",
    effectText: "目が1の未確定のダイスを追加できる",
    effectType: "add_die",
    check: (dice) => sum(dice) >= 15
  },
  {
    id: "guard",
    name: "衛兵",
    group: "I",
    reqText: "3つのダイスの目が同じ（スリーカード）",
    effectText: "目が2の未確定のダイスを追加できる",
    effectType: "add_die",
    check: (dice) => hasKind(dice, 3)
  },

  // --- II（4ダイスで取得可）---
  {
    id: "hunter",
    name: "狩人",
    group: "II",
    reqText: "4つのダイスの目が同じ（フォーカード）",
    effectText: "目が3の未確定のダイスを追加できる",
    effectType: "add_die",
    check: (dice) => hasKind(dice, 4)
  },
  {
    id: "trader",
    name: "商人",
    group: "II",
    reqText: "ダイスの目の合計が20以上",
    effectText: "好きな数の未確定のダイスを振りなおすことができる",
    effectType: "reroll_any",
    check: (dice) => sum(dice) >= 20
  },
  {
    id: "astronomer",
    name: "天文学者",
    group: "II",
    reqText: "ダイスの目が同じペアが2つ以上ある（同目4つも2ペア扱い）",
    effectText: "未確定のダイス1つの目を確定済みのダイス1つの目に変更できる",
    effectType: "modify",
    check: (dice) => hasPairsAtLeast(dice, 2)
  },

  // --- III（5ダイスで取得可）---
  {
    id: "lady",
    name: "女官",
    group: "III",
    reqText: "2つ同じ組と3つ同じ組が1つずつ（例:22555）",
    effectText: "好きな数の未確定ダイスの目に+1（6には不可）",
    effectType: "modify",
    check: (dice) => hasPairAndTriple(dice)
  },
  {
    id: "pawnbroker",
    name: "質屋",
    group: "III",
    reqText: "ダイスの目の合計が30以上",
    effectText: "目が4の未確定のダイスを追加できる",
    effectType: "add_die",
    check: (dice) => sum(dice) >= 30
  },
  {
    id: "cavalier",
    name: "騎士",
    group: "III",
    reqText: "5つのダイスの目が同じ（ファイブカード）",
    effectText: "目が5の未確定のダイスを追加できる",
    effectType: "add_die",
    check: (dice) => hasKind(dice, 5)
  },
  {
    id: "magician",
    name: "魔術師",
    group: "III",
    reqText: "12345または23456の確定ストレート",
    effectText: "未確定のダイス1つを好きな目に変更できる",
    effectType: "modify",
    check: (dice) => hasStraight5(dice)
  },

  // --- IV（6ダイスで取得可）---
  {
    id: "alchemist",
    name: "錬金術師",
    group: "IV",
    reqText: "123456の確定ストレート（フルストレート）",
    effectText: "3つのダイスの目をその和を変えない範囲で変更できる",
    effectType: "modify",
    check: (dice) => hasFullStraight(dice)
  },
  {
    id: "bishop",
    name: "司教",
    group: "IV",
    reqText: "ダイスの目が同じペアが3つ以上ある",
    effectText: "目が6の未確定のダイスを追加できる",
    effectType: "add_die",
    check: (dice) => hasPairsAtLeast(dice, 3)
  },
  {
    id: "noble",
    name: "貴族",
    group: "IV",
    reqText: "スリーカードが2組（例:111222）",
    effectText: "好きな数の未確定ダイスの目に+2（5には不可）",
    effectType: "modify",
    check: (dice) => hasTwoTriples(dice)
  },
  {
    id: "general",
    name: "将軍",
    group: "IV",
    reqText: "6つのダイスの目が同じ（シックスカード）",
    effectText: "手番の最初に振るダイスが2つ追加される",
    effectType: "extra_at_start",
    check: (dice) => hasKind(dice, 6)
  },

  // --- V（終局カード）---
  {
    id: "king",
    name: "国王",
    group: "V",
    reqText: "7つのダイスの目が同じ（セブンカード）",
    effectText: "最終ラウンド終了時、保持者が勝利",
    effectType: "win",
    check: (dice) => hasKind(dice, 7)
  },
  {
    id: "queen",
    name: "王妃",
    group: "V",
    reqText: "国王取得時に同時付与（単独取得は不可）",
    effectText: "好きな目の未確定のダイスを追加できる",
    effectType: "add_die_choice",
    check: (dice) => false // 単独取得不可。国王取得時にmain.js側で自動付与
  }
];

// ============================================================
// 取得可能カード判定（優先順位ロジック込み）
// ============================================================
// dice: 確定済みダイスの出目配列
// ownedCardIds: このプレイヤーが既に持っているカードidの配列
// availableCardIds: 場（未取得）に残っているカードidの配列
// 戻り値: 取得候補カードidの配列（複数ある場合はプレイヤーが選択）
function getClaimableCards(dice, ownedCardIds, availableCardIds) {
  const owned = new Set(ownedCardIds);
  const available = new Set(availableCardIds);

  // 国王・王妃を除く通常カードで、条件を満たし・未所持・場に残っているもの
  const normalMatches = CARDS.filter(c => {
    if (c.specialRule === "fool" || c.specialRule === "charlatan") return false;
    if (c.id === "queen") return false; // 王妃は単独取得不可
    if (owned.has(c.id)) return false;
    if (!available.has(c.id)) return false;
    return c.check(dice);
  }).map(c => c.id);

  if (normalMatches.length > 0) {
    return normalMatches;
  }

  // ここまでで該当なし＝「豚」状態
  // ペテン師判定：道化師を所持していて、まだペテン師を持っていなければ候補になる
  if (owned.has("fool") && !owned.has("charlatan") && available.has("charlatan")) {
    return ["charlatan"];
  }

  // 道化師判定：道化師・ペテン師どちらも未所持であれば道化師が救済枠として候補になる
  if (!owned.has("fool") && !owned.has("charlatan") && available.has("fool")) {
    return ["fool"];
  }

  // 完全な空振り（道化師もペテン師も既に持っている、または両方とも取り尽くされている）
  return [];
}

// 国王取得時、王妃も同時付与するかを呼び出し側(main.js)で判定するためのヘルパー
function isKingCard(cardId) {
  return cardId === "king";
}

function getCardById(id) {
  return CARDS.find(c => c.id === id);
}

// 2人プレイ時の各カード必要枚数（Ⅰ:2, Ⅱ:1, Ⅲ/Ⅳ:1, Ⅴ:1、道化師/ペテン師は無制限）
const CARD_COUNT_2P = {
  "I": 2,
  "II": 1,
  "III": 1,
  "IV": 1,
  "V": 1
};

// 場に並べる初期カードスタックを生成（2人プレイ専用）
function buildInitialDeck() {
  const deck = {}; // cardId -> 残り枚数
  CARDS.forEach(c => {
    if (c.group === "0") {
      deck[c.id] = Infinity; // 道化師・ペテン師は無制限
    } else if (c.id === "queen" || c.id === "king") {
      deck[c.id] = 1; // 国王・王妃は1回のみ（王妃は国王とセット付与）
    } else {
      deck[c.id] = CARD_COUNT_2P[c.group] || 1;
    }
  });
  return deck;
}

// Node/ブラウザ両対応のエクスポート（このプロジェクトはブラウザ想定、グローバル公開のみ）
if (typeof module !== "undefined" && module.exports) {
  module.exports = { CARDS, getClaimableCards, isKingCard, getCardById, buildInitialDeck };
}
