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
