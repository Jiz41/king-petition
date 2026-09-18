// ============================================================
// 王への請願 - P2P接続処理 (PeerJSクラウド利用)
// ひらがな8文字のルームIDを生成し、そのままPeerJSのIDとして使う
// ============================================================

// ひらがな8文字ID生成に使う文字セット
// 濁点・半濁点・小文字（ゃゅょっ等）・紛らわしい文字（を、ん単独等）は除外し
// 読み間違い・入力ミスを減らす
const HIRAGANA_CHARS = [
  "あ","い","う","え","お",
  "か","き","く","け","こ",
  "さ","し","す","せ","そ",
  "た","ち","つ","て","と",
  "な","に","ぬ","ね","の",
  "は","ひ","ふ","へ","ほ",
  "ま","み","む","め","も",
  "や","ゆ","よ",
  "ら","り","る","れ","ろ",
  "わ"
];

function generateRoomId(length = 8) {
  let id = "";
  for (let i = 0; i < length; i++) {
    id += HIRAGANA_CHARS[Math.floor(Math.random() * HIRAGANA_CHARS.length)];
  }
  return id;
}

// PeerJSのPeer IDは英数字・ハイフン・アンダースコアのみを安全な範囲として扱う実装が多いため、
// 表示・共有用の「ひらがな8文字」と、実際にPeerJSへ渡す「内部ID（英数字）」を分離する。
// 変換は決定的（同じひらがな文字列からは常に同じ内部IDが得られる）なので、
// 参加側は表示されたひらがなをそのまま入力すればよい。
const HIRAGANA_TO_CODE = {};
HIRAGANA_CHARS.forEach((ch, i) => {
  // 2桁ゼロ埋めのコードに変換（例: "あ" -> "00"）
  HIRAGANA_TO_CODE[ch] = String(i).padStart(2, "0");
});
const CODE_TO_HIRAGANA = {};
HIRAGANA_CHARS.forEach((ch, i) => {
  CODE_TO_HIRAGANA[String(i).padStart(2, "0")] = ch;
});

// ひらがな文字列 -> PeerJS用の内部ID（例: "kpk_0203..." のような英数字）
function hiraganaToPeerId(hiragana) {
  const chars = Array.from(hiragana); // サロゲートペア対策
  const code = chars.map(ch => HIRAGANA_TO_CODE[ch] ?? "99").join("");
  return "kpk_" + code; // "king-petition" の略をprefixにして名前空間の衝突を避ける
}

// PeerJS用の内部ID -> ひらがな文字列（表示用、逆変換が必要な場面向け）
function peerIdToHiragana(peerId) {
  const code = peerId.replace(/^kpk_/, "");
  const pairs = code.match(/.{1,2}/g) || [];
  return pairs.map(p => CODE_TO_HIRAGANA[p] ?? "?").join("");
}

// ============================================================
// P2P接続マネージャ
// ============================================================
class P2PManager {
  constructor() {
    this.peer = null;
    this.conn = null; // 参加側:ホストへの接続 / ホスト側は connections配列を使う
    this.connections = []; // ホスト側が保持する、参加者ごとの接続
    this.isHost = false;
    this.roomId = null;

    // コールバック（main.js側でセットする）
    this.onOpen = null;         // 自分のPeerが開通した時
    this.onPeerJoined = null;   // (ホスト側) 誰かが参加してきた時
    this.onData = null;         // データ受信時 (data, senderConn) => {}
    this.onConnError = null;    // 接続エラー時
    this.onPeerDisconnected = null; // 相手が切断した時
  }

  // ホストとして部屋を作る。ひらがな8文字を生成し、内部的にはPeerJS用IDに変換して使う
  createRoom() {
    this.isHost = true;
    this.roomId = generateRoomId(8); // 表示・共有用（ひらがな）
    const internalId = hiraganaToPeerId(this.roomId); // PeerJSに実際に渡すID

    this.peer = new Peer(internalId);

    this.peer.on("open", () => {
      // 呼び出し側にはひらがな表記のroomIdを渡す（内部IDは意識させない）
      if (this.onOpen) this.onOpen(this.roomId);
    });

    this.peer.on("connection", (conn) => {
      this.connections.push(conn);
      conn.on("data", (data) => {
        if (this.onData) this.onData(data, conn);
      });
      conn.on("close", () => {
        this.connections = this.connections.filter(c => c !== conn);
        if (this.onPeerDisconnected) this.onPeerDisconnected(conn.peer);
      });
      if (this.onPeerJoined) this.onPeerJoined(conn);
    });

    this.peer.on("error", (err) => {
      if (this.onConnError) this.onConnError(err);
    });

    return this.roomId;
  }

  // 参加者として、ホストが共有したひらがな8文字を指定して接続する
  joinRoom(hostRoomIdHiragana) {
    this.isHost = false;
    this.roomId = hostRoomIdHiragana;
    const internalHostId = hiraganaToPeerId(hostRoomIdHiragana);

    // 自分自身のPeerIDはランダムな内部IDでよい（衝突回避のためprefix付与）
    const myTempId = "kpk_guest_" + Math.random().toString(36).substr(2, 8);
    this.peer = new Peer(myTempId);

    this.peer.on("open", () => {
      this.conn = this.peer.connect(internalHostId);

      this.conn.on("open", () => {
        if (this.onOpen) this.onOpen(myTempId);
      });

      this.conn.on("data", (data) => {
        if (this.onData) this.onData(data, this.conn);
      });

      this.conn.on("close", () => {
        if (this.onPeerDisconnected) this.onPeerDisconnected(hostRoomIdHiragana);
      });

      this.conn.on("error", (err) => {
        if (this.onConnError) this.onConnError(err);
      });
    });

    this.peer.on("error", (err) => {
      if (this.onConnError) this.onConnError(err);
    });
  }

  // データ送信：ホストは全参加者に、参加者はホストにのみ送る
  send(data) {
    if (this.isHost) {
      this.connections.forEach(c => {
        if (c.open) c.send(data);
      });
    } else {
      if (this.conn && this.conn.open) {
        this.conn.send(data);
      }
    }
  }

  // 接続が生きているか（タイマン限定なので、ホストは1接続のみ許容）
  isConnected() {
    if (this.isHost) return this.connections.length > 0;
    return this.conn && this.conn.open;
  }

  destroy() {
    if (this.peer) {
      this.peer.destroy();
    }
  }
}

// クリップボードへのコピー（ボタン用）
// 成功/失敗をPromiseで返す。HTTPS/localhost以外の環境向けフォールバックも用意
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // フォールバック（古いブラウザ・非HTTPS環境向け）
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    return success;
  } catch (e) {
    return false;
  }
}
