// ============================================================
// 王への請願 - UI制御
// フェーズ表示 / ルール参照モーダル / 取得可能カードのハイライト / SE再生
// ============================================================

// ---- SE（効果音）管理 ----
const SOUNDS = {
  diceRoll: new Audio("assets/sounds/dice_roll.mp3"),
  diceLock: new Audio("assets/sounds/dice_lock.mp3"),
  turnChange: new Audio("assets/sounds/turn_change.mp3"),
};

function playSound(name) {
  const audio = SOUNDS[name];
  if (!audio) return;
  // 連打しても毎回頭から鳴るように再生位置をリセット
  audio.currentTime = 0;
  audio.play().catch(() => {
    // 自動再生ポリシーでブロックされた場合は無視（ユーザー操作後は再生可能になる）
  });
}

// ---- フェーズ表示 ----
// phase: "rolling"(ロール中) / "keeping"(確保待ち) / "claiming"(カード選択中)
//        / "opponent_turn"(相手の手番) / "final_roll"(ファイナルロール) / "ended"(終了)
const PHASE_LABELS = {
  rolling: "🎲 ダイスを振ってください",
  keeping: "✋ ダイスを確保してください（最低1個）",
  claiming: "📜 カードを選択してください",
  opponent_turn: "⏳ 相手の手番です",
  final_roll: "👑 ファイナルロール！",
  ended: "🏁 ゲーム終了",
};

function updatePhaseDisplay(phase, extraText) {
  const el = document.getElementById("phase-info");
  if (!el) return;
  el.textContent = PHASE_LABELS[phase] || phase;
  if (extraText) {
    el.textContent += "　" + extraText;
  }
}

// ---- ルール参照モーダル ----
function openRuleModal() {
  const modal = document.getElementById("rule-modal");
  if (modal) modal.style.display = "flex";
}

function closeRuleModal() {
  const modal = document.getElementById("rule-modal");
  if (modal) modal.style.display = "none";
}

// ルール一覧モーダルの中身を、game.jsのCARDS定義から自動生成する
function buildRuleModalContent() {
  const container = document.getElementById("rule-modal-body");
  if (!container || typeof CARDS === "undefined") return;

  const groupOrder = ["0", "I", "II", "III", "IV", "V"];
  const groupLabels = {
    "0": "0（誰でも取得可）",
    "I": "Ⅰ（3ダイスで取得可）",
    "II": "Ⅱ（4ダイスで取得可）",
    "III": "Ⅲ（5ダイスで取得可）",
    "IV": "Ⅳ（6ダイスで取得可）",
    "V": "Ⅴ（終局カード）",
  };

  let html = "";
  groupOrder.forEach(group => {
    const cardsInGroup = CARDS.filter(c => c.group === group);
    if (cardsInGroup.length === 0) return;
    html += `<h3 class="rule-group-title">${groupLabels[group]}</h3>`;
    html += `<table class="rule-table"><thead><tr><th>カード</th><th>取得条件</th><th>効果</th></tr></thead><tbody>`;
    cardsInGroup.forEach(c => {
      html += `<tr><td>${c.name}</td><td>${c.reqText}</td><td>${c.effectText}</td></tr>`;
    });
    html += `</tbody></table>`;
  });

  container.innerHTML = html;
}

// ---- 取得可能カードのハイライト ----
// dice: 現在の確定ダイス配列, ownedCardIds: 自分の所持カード, availableCardIds: 場に残っているカード
function highlightClaimableCards(dice, ownedCardIds, availableCardIds) {
  if (typeof getClaimableCards === "undefined") return;
  const claimable = new Set(getClaimableCards(dice, ownedCardIds, availableCardIds));

  document.querySelectorAll(".card-item").forEach(el => {
    const cardId = el.dataset.cardId;
    if (claimable.has(cardId)) {
      el.classList.add("claimable");
    } else {
      el.classList.remove("claimable");
    }
  });

  return claimable;
}

// ============================================================
// カード恒久能力 UI（効果発動パネル＆モーダル）
// ============================================================

// 現在開いているモーダルの選択状態
let effectModalState = null;

// 「使用可能な効果」パネルの描画（rollingフェーズ・自分の手番のときのみ内容表示）
function renderEffectsPanel() {
  const panel = document.getElementById("effects-panel");
  if (!panel || !state || typeof EFFECT_CARD_IDS === "undefined") return;

  const myOwnedIds = state.players[myPlayerId]?.cards || [];
  const ownedEffectCards = EFFECT_CARD_IDS.filter(id => myOwnedIds.includes(id));

  if (ownedEffectCards.length === 0) {
    panel.innerHTML = "";
    return;
  }

  let html = `<div class="effects-panel-label">使用可能な効果</div><div class="effects-buttons">`;
  ownedEffectCards.forEach(cardId => {
    const card = getCardById(cardId);
    const enabled = canUseEffectNow(cardId);
    html += `<button class="effect-use-btn" ${enabled ? "" : "disabled"} onclick="openEffectModal('${cardId}')">${card.name}の効果を使う</button>`;
  });
  html += `</div>`;
  panel.innerHTML = html;
}

// ---- モーダルの開閉 ----
function openEffectModal(cardId) {
  effectModalState = { cardId: cardId, sel: [], values: {} };
  document.getElementById("effect-modal-title").textContent = `${getCardById(cardId).name}の効果を使う`;
  document.getElementById("effect-modal").style.display = "flex";
  renderEffectModalBody();
}

function closeEffectModal() {
  effectModalState = null;
  document.getElementById("effect-modal").style.display = "none";
}

function confirmEffectModal() {
  if (!effectModalState) return;
  const payload = buildEffectPayload(effectModalState);
  if (!payload) return;
  sendUseEffect(effectModalState.cardId, payload);
  closeEffectModal();
}

// 未確定ダイスの現在値一覧（idx付き）
function unkeptDiceList() {
  return state.dice
    .map((v, i) => ({ idx: i, value: v }))
    .filter(d => !state.kept[d.idx]);
}

function keptDiceValues() {
  return state.dice.filter((v, i) => state.kept[i]);
}

// 対象ダイス選択ボタン群を描画するHTMLを返す（maxCount: 選べる最大数）
function renderTargetPicker(maxCount) {
  const list = unkeptDiceList();
  let html = `<div class="effect-target-label">対象の未確定ダイスを選択（${maxCount}個）</div><div class="effect-dice-picker">`;
  list.forEach(d => {
    const selected = effectModalState.sel.includes(d.idx);
    html += `<button type="button" class="effect-die-btn ${selected ? "selected" : ""}" onclick="toggleEffectTarget(${d.idx}, ${maxCount})">${d.value}</button>`;
  });
  html += `</div>`;
  return html;
}

function toggleEffectTarget(idx, maxCount) {
  const sel = effectModalState.sel;
  const pos = sel.indexOf(idx);
  if (pos !== -1) {
    sel.splice(pos, 1);
  } else {
    if (sel.length >= maxCount) return;
    sel.push(idx);
  }
  renderEffectModalBody();
}

function valueButtons(name, onclickPrefix) {
  let html = `<div class="effect-value-picker">`;
  for (let v = 1; v <= 6; v++) {
    html += `<button type="button" class="effect-value-btn" onclick="${onclickPrefix}(${v})">${v}</button>`;
  }
  html += `</div>`;
  return html;
}

// モーダル本文をカード種別ごとに描画し、確定ボタンの有効/無効を更新する
function renderEffectModalBody() {
  const body = document.getElementById("effect-modal-body");
  const confirmBtn = document.getElementById("effect-modal-confirm");
  if (!body || !effectModalState) return;
  const cardId = effectModalState.cardId;
  const sel = effectModalState.sel;
  let html = "";
  let canConfirm = false;

  if (cardId === "fool") {
    html += renderTargetPicker(1);
    canConfirm = sel.length === 1;

  } else if (cardId === "magician") {
    html += renderTargetPicker(1);
    if (sel.length === 1) {
      html += `<div class="effect-target-label">新しい目を選択</div>`;
      html += valueButtons("newValue", "pickMagicianValue");
      if (effectModalState.values.newValue) {
        html += `<div class="effect-selected-value">選択中: ${effectModalState.values.newValue}</div>`;
        canConfirm = true;
      }
    }

  } else if (cardId === "queen") {
    html += `<div class="effect-target-label">追加する未確定ダイスの目を選択</div>`;
    html += valueButtons("newValue", "pickQueenValue");
    if (effectModalState.values.newValue) {
      html += `<div class="effect-selected-value">選択中: ${effectModalState.values.newValue}</div>`;
      canConfirm = true;
    }

  } else if (cardId === "maid") {
    html += renderTargetPicker(1);
    if (sel.length === 1) {
      const cur = state.dice[sel[0]];
      html += `<div class="effect-target-label">加算量を選択</div><div class="effect-value-picker">`;
      [1, 2, 3].forEach(amount => {
        const over = cur + amount > 6;
        const active = effectModalState.values.amount === amount;
        html += `<button type="button" class="effect-value-btn ${active ? "selected" : ""}" ${over ? "disabled" : ""} onclick="pickMaidAmount(${amount})">+${amount}</button>`;
      });
      html += `</div>`;
      if (effectModalState.values.amount) canConfirm = true;
    }

  } else if (cardId === "astronomer") {
    html += renderTargetPicker(1);
    if (sel.length === 1) {
      const kept = keptDiceValues();
      html += `<div class="effect-target-label">確定済みダイスの目から選択</div><div class="effect-value-picker">`;
      kept.forEach(v => {
        const active = effectModalState.values.sourceValue === v;
        html += `<button type="button" class="effect-value-btn ${active ? "selected" : ""}" onclick="pickAstronomerValue(${v})">${v}</button>`;
      });
      html += `</div>`;
      if (kept.length === 0) html += `<p class="effect-hint">確定済みのダイスがありません</p>`;
      if (effectModalState.values.sourceValue) canConfirm = true;
    }

  } else if (cardId === "philosopher") {
    html += renderTargetPicker(2);
    if (sel.length === 2) {
      const origSum = state.dice[sel[0]] + state.dice[sel[1]];
      html += `<div class="effect-target-label">元の合計: ${origSum}</div>`;
      html += renderSwapSelects(sel, ["valA", "valB"]);
      const a = effectModalState.values.valA, b = effectModalState.values.valB;
      if (a && b) {
        const newSum = a + b;
        html += `<div class="effect-selected-value ${newSum === origSum ? "ok" : "ng"}">現在の合計: ${newSum}（${newSum === origSum ? "一致" : "不一致"}）</div>`;
        canConfirm = newSum === origSum;
      }
    }

  } else if (cardId === "alchemist") {
    html += renderTargetPicker(3);
    if (sel.length === 3) {
      const origSum = sel.reduce((s, idx) => s + state.dice[idx], 0);
      html += `<div class="effect-target-label">元の合計: ${origSum}</div>`;
      html += renderSwapSelects(sel, ["valA", "valB", "valC"]);
      const a = effectModalState.values.valA, b = effectModalState.values.valB, c = effectModalState.values.valC;
      if (a && b && c) {
        const newSum = a + b + c;
        html += `<div class="effect-selected-value ${newSum === origSum ? "ok" : "ng"}">現在の合計: ${newSum}（${newSum === origSum ? "一致" : "不一致"}）</div>`;
        canConfirm = newSum === origSum;
      }
    }

  } else if (cardId === "lady") {
    const list = unkeptDiceList().filter(d => d.value !== 6);
    html += `<div class="effect-target-label">好きな数だけ選択（各+1、6のダイスは対象外）</div><div class="effect-dice-picker">`;
    list.forEach(d => {
      const selected = sel.includes(d.idx);
      html += `<button type="button" class="effect-die-btn ${selected ? "selected" : ""}" onclick="toggleEffectTargetMulti(${d.idx})">${d.value}</button>`;
    });
    html += `</div>`;
    canConfirm = sel.length > 0;

  } else if (cardId === "noble") {
    const list = unkeptDiceList().filter(d => d.value + 2 <= 6);
    html += `<div class="effect-target-label">好きな数だけ選択（各+2、6を超えるダイスは対象外）</div><div class="effect-dice-picker">`;
    list.forEach(d => {
      const selected = sel.includes(d.idx);
      html += `<button type="button" class="effect-die-btn ${selected ? "selected" : ""}" onclick="toggleEffectTargetMulti(${d.idx})">${d.value}</button>`;
    });
    html += `</div>`;
    canConfirm = sel.length > 0;
  }

  body.innerHTML = html;
  confirmBtn.disabled = !canConfirm;
}

// lady/noble用：上限なしの複数選択トグル
function toggleEffectTargetMulti(idx) {
  const sel = effectModalState.sel;
  const pos = sel.indexOf(idx);
  if (pos !== -1) sel.splice(pos, 1);
  else sel.push(idx);
  renderEffectModalBody();
}

// philosopher/alchemist用：選択した各ダイスへの新しい目セレクタ
function renderSwapSelects(idxs, keys) {
  let html = `<div class="effect-swap-selects">`;
  idxs.forEach((idx, i) => {
    const key = keys[i];
    const cur = effectModalState.values[key] || "";
    html += `<div class="effect-swap-item">
      <span>ダイス${i + 1}（元:${state.dice[idx]}）→</span>
      <select onchange="pickSwapValue('${key}', this.value)">
        <option value="">選択</option>
        ${[1,2,3,4,5,6].map(v => `<option value="${v}" ${String(cur) === String(v) ? "selected" : ""}>${v}</option>`).join("")}
      </select>
    </div>`;
  });
  html += `</div>`;
  return html;
}

function pickSwapValue(key, value) {
  effectModalState.values[key] = value ? parseInt(value, 10) : null;
  renderEffectModalBody();
}

function pickMagicianValue(v) {
  effectModalState.values.newValue = v;
  renderEffectModalBody();
}

function pickQueenValue(v) {
  effectModalState.values.newValue = v;
  renderEffectModalBody();
}

function pickMaidAmount(amount) {
  effectModalState.values.amount = amount;
  renderEffectModalBody();
}

function pickAstronomerValue(v) {
  effectModalState.values.sourceValue = v;
  renderEffectModalBody();
}

// 選択状態からACTION送信用payloadを組み立てる
function buildEffectPayload(m) {
  const sel = m.sel;
  const vals = m.values;
  if (m.cardId === "fool") {
    return { targetIdx: sel[0] };
  } else if (m.cardId === "magician") {
    if (!vals.newValue) return null;
    return { targetIdx: sel[0], newValue: vals.newValue };
  } else if (m.cardId === "maid") {
    if (!vals.amount) return null;
    return { targetIdx: sel[0], amount: vals.amount };
  } else if (m.cardId === "astronomer") {
    if (!vals.sourceValue) return null;
    return { targetIdx: sel[0], sourceValue: vals.sourceValue };
  } else if (m.cardId === "philosopher") {
    if (!vals.valA || !vals.valB) return null;
    return { idxA: sel[0], idxB: sel[1], newValueA: vals.valA, newValueB: vals.valB };
  } else if (m.cardId === "alchemist") {
    if (!vals.valA || !vals.valB || !vals.valC) return null;
    return { idxA: sel[0], idxB: sel[1], idxC: sel[2], newValueA: vals.valA, newValueB: vals.valB, newValueC: vals.valC };
  } else if (m.cardId === "lady" || m.cardId === "noble") {
    if (sel.length === 0) return null;
    return { targetIdxs: sel.slice() };
  } else if (m.cardId === "queen") {
    if (!vals.newValue) return null;
    return { newValue: vals.newValue };
  }
  return null;
}

// ---- コピー完了時のボタンフィードバック ----
function flashCopyButton(buttonEl, originalText) {
  const prev = buttonEl.textContent;
  buttonEl.textContent = "コピーしました！";
  buttonEl.disabled = true;
  setTimeout(() => {
    buttonEl.textContent = originalText || prev;
    buttonEl.disabled = false;
  }, 1500);
}

// ---- 簡易トースト通知（エラー表示等に使用）----
function showToast(message, duration = 3000) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, duration);
}
