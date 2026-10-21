// Community puzzles: members publish "find the winning move" positions
// (arranged freely, engine-verified before publish — the side to move
// must have at least one immediate five). Browse, solve, like, remix.
// Author credit on every card; solves pay XP via cr_solve_community_puzzle.

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Board } from "./Board";
import { useAuth } from "./AuthProvider";
import {
  deleteCommunityPuzzle,
  fetchCommunityPuzzle,
  fetchCommunityPuzzles,
  publishCommunityPuzzle,
  renameCommunityPuzzle,
  solveCommunityPuzzle,
  toggleCommunityLike,
  type CommunityPuzzleCard,
  type CommunitySort,
} from "@/lib/supabase/community";
import {
  applyMove,
  boardToState,
  initialState,
  makeMove,
  parsePosition,
  playerOfColor,
  serializePosition,
  stateToBoard,
  type Board as BoardT,
  type Color,
  type Lang,
} from "@/lib/caro/engineApi";
import { emptyBoard } from "@/lib/caro/setup";
import { BOARD_SIZES, createFromBoard } from "@/lib/caro/engine";
import { winsAt } from "@/lib/caro/ai";

const PAGE_SIZE = 10;

export function CommunityView({
  lang,
  initialPuzzleId,
  onInitialConsumed,
}: {
  lang: Lang;
  initialPuzzleId?: string | null;
  onInitialConsumed?: () => void;
}) {
  const { user } = useAuth();
  const vi = lang === "vi";
  const [sort, setSort] = useState<CommunitySort>("new");
  const [page, setPage] = useState(0);
  const [cards, setCards] = useState<CommunityPuzzleCard[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<CommunityPuzzleCard | null>(null);
  const [creating, setCreating] = useState(false);
  const [seed, setSeed] = useState<{ pos: string; title: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchCommunityPuzzles(
        sort,
        PAGE_SIZE + 1,
        page * PAGE_SIZE
      );
      setHasNext(rows.length > PAGE_SIZE);
      setCards(rows.slice(0, PAGE_SIZE));
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [sort, page]);

  useEffect(() => {
    if (!active && !creating) load();
  }, [load, active, creating]);

  // Deep link ?cpuzzle=<id>.
  useEffect(() => {
    if (!initialPuzzleId) return;
    fetchCommunityPuzzle(initialPuzzleId)
      .then((c) => {
        if (c) setActive(c);
        onInitialConsumed?.();
      })
      .catch(() => onInitialConsumed?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPuzzleId]);

  if (active) {
    return (
      <SolveView
        lang={lang}
        card={active}
        onBack={() => setActive(null)}
        onRemix={(c) => {
          setActive(null);
          setSeed({
            pos: c.pos,
            title: vi ? `Remix: ${c.title}` : `Remix of ${c.title}`,
          });
          setCreating(true);
        }}
      />
    );
  }

  if (creating) {
    return (
      <CreateView
        lang={lang}
        seed={seed}
        onDone={() => {
          setCreating(false);
          setSeed(null);
          setSort("mine");
          setPage(0);
        }}
        onCancel={() => {
          setCreating(false);
          setSeed(null);
        }}
      />
    );
  }

  const sorts: { key: CommunitySort; label: string }[] = [
    { key: "new", label: vi ? "Mới nhất" : "Newest" },
    { key: "popular", label: vi ? "Nổi bật" : "Popular" },
    { key: "weekly", label: vi ? "Tuần này" : "This week" },
    ...(user
      ? [{ key: "mine" as CommunitySort, label: vi ? "Của tôi" : "Mine" }]
      : []),
  ];

  return (
    <div className="cr-view">
      <div className="cr-view-head">
        <h2>🧩 {vi ? "Thế cờ cộng đồng" : "Community puzzles"}</h2>
        <button
          type="button"
          className="cr-btn cr-btn-primary cr-btn-sm"
          onClick={() => {
            if (!user) {
              alert(vi ? "Đăng nhập để tạo thế cờ." : "Sign in to create a puzzle.");
              return;
            }
            setSeed(null);
            setCreating(true);
          }}
        >
          ＋ {vi ? "Tạo thế cờ" : "Create"}
        </button>
      </div>
      <div className="cr-tabs">
        {sorts.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`cr-tab${sort === t.key ? " active" : ""}`}
            onClick={() => {
              setSort(t.key);
              setPage(0);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {loading ? (
        <p>…</p>
      ) : cards.length === 0 ? (
        <p className="cr-hint">
          {vi
            ? "Chưa có thế cờ nào. Hãy tạo thế cờ đầu tiên — đặt quân tự do, máy sẽ kiểm chứng nước thắng trước khi đăng."
            : "No puzzles yet. Create the first one — place stones freely; the engine verifies the winning move before publishing."}
        </p>
      ) : (
        <ul className="cr-board-list">
          {cards.map((c) => (
            <li key={c.id} className="cr-lb-row">
              <span className="cr-lb-name">
                {c.is_featured ? "⭐ " : ""}
                {c.title || (vi ? "(Không tên)" : "(Untitled)")}{" "}
                <span className="cr-lb-title">
                  {vi ? "bởi" : "by"} {c.creator_name} · ✅ {c.solves} · ❤️{" "}
                  {c.likes}
                  {c.solved_by_me ? (vi ? " · Đã giải" : " · Solved") : ""}
                </span>
              </span>
              <button
                type="button"
                className="cr-btn cr-btn-primary cr-btn-sm"
                onClick={() => setActive(c)}
              >
                ▶ {vi ? "Giải" : "Play"}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="cr-row">
        <button
          type="button"
          className="cr-btn cr-btn-sm"
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          ← {vi ? "Trước" : "Prev"}
        </button>
        <span className="cr-lb-title">
          {vi ? "Trang" : "Page"} {page + 1}
        </span>
        <button
          type="button"
          className="cr-btn cr-btn-sm"
          disabled={!hasNext}
          onClick={() => setPage((p) => p + 1)}
        >
          {vi ? "Sau" : "Next"} →
        </button>
      </div>
    </div>
  );
}

function SolveView({
  lang,
  card,
  onBack,
  onRemix,
}: {
  lang: Lang;
  card: CommunityPuzzleCard;
  onBack: () => void;
  onRemix: (c: CommunityPuzzleCard) => void;
}) {
  const { user, refreshProfile } = useAuth();
  const vi = lang === "vi";
  const start = useMemo(
    () => parsePosition(card.pos) ?? initialState(),
    [card.pos]
  );
  const [pos, setPos] = useState(start);
  const [picked, setPicked] = useState<number | null>(null);
  const [solved, setSolved] = useState(card.solved_by_me);
  const [failed, setFailed] = useState(false);
  const [liked, setLiked] = useState(card.liked_by_me);
  const [likes, setLikes] = useState(card.likes);
  const [xpMsg, setXpMsg] = useState("");
  const solutions = useMemo(
    () =>
      new Set(
        card.solution
          .split(/\s+/)
          .map((t) => Number(t.trim()))
          .filter((n) => Number.isFinite(n))
      ),
    [card.solution]
  );
  const side: Color = start.turn === 1 ? "x" : "o";
  const mine = !!user && user.id === card.creator_id;

  const onSquareClick = async (sq: number) => {
    if (solved || failed) return;
    if (pos.board[sq] !== 0) return;
    setPicked(sq);
    if (solutions.has(sq)) {
      setPos(applyMove(pos, makeMove(sq, pos.size)).state);
      setSolved(true);
      if (user && !card.solved_by_me) {
        try {
          const xp = await solveCommunityPuzzle(card.id);
          if (xp > 0) setXpMsg(`🎉 +${xp} XP`);
          refreshProfile();
        } catch {
          /* ignore */
        }
      }
    } else {
      setFailed(true);
    }
  };

  const doLike = async () => {
    if (!user) {
      alert(vi ? "Đăng nhập để thích thế cờ." : "Sign in to like puzzles.");
      return;
    }
    try {
      const r = await toggleCommunityLike(card.id);
      setLiked(r.liked);
      setLikes(r.likes);
    } catch {
      /* ignore */
    }
  };

  const doShare = async () => {
    const url = `https://cocaro.synerworlds.com/?cpuzzle=${card.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setXpMsg(vi ? "Đã chép liên kết!" : "Link copied!");
    } catch {
      setXpMsg(url);
    }
  };

  const doRename = async () => {
    const t = window.prompt(vi ? "Tên mới:" : "New title:", card.title);
    if (t == null) return;
    try {
      await renameCommunityPuzzle(card.id, t);
      card.title = t.slice(0, 60);
      setXpMsg(vi ? "Đã đổi tên." : "Renamed.");
    } catch {
      /* ignore */
    }
  };

  const doDelete = async () => {
    if (!window.confirm(vi ? "Xóa thế cờ này?" : "Delete this puzzle?")) return;
    try {
      await deleteCommunityPuzzle(card.id);
      onBack();
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="cr-layout">
      <div className="cr-board-area">
        <div className="cr-board-fit">
          <Board
            board={stateToBoard(pos)}
            size={pos.size}
            flipped={side === "o"}
            lastMove={picked != null ? makeMove(picked, pos.size) : null}
            winningRun={pos.result.winningRun}
            ghostColor={!solved && !failed ? side : null}
            interactive={!solved && !failed}
            boardLabel={card.title}
            onSquareClick={onSquareClick}
          />
        </div>
      </div>
      <div className="cr-panel">
        <div className="cr-panel-head">
          <button type="button" className="cr-btn cr-btn-sm" onClick={onBack}>
            ← {vi ? "Danh sách" : "List"}
          </button>
          <div className="cr-puzzle-title">
            {card.is_featured ? "⭐ " : ""}
            {card.title || (vi ? "(Không tên)" : "(Untitled)")}
          </div>
        </div>
        <div className="cr-puzzle-body">
          <p className="cr-lb-title">
            {vi ? "bởi" : "by"} {card.creator_name} · ✅ {card.solves} · ❤️ {likes}
          </p>
          {!solved && !failed && (
            <p>
              {vi
                ? "Tìm nước thắng ngay cho "
                : "Find the immediate win for "}
              <b>{side === "x" ? "X" : "O"}</b>
            </p>
          )}
          {solved && <p>🎉 {vi ? "Chính xác — thế cờ đã giải!" : "Correct — puzzle solved!"}</p>}
          {failed && (
            <div>
              <p>❌ {vi ? "Chưa đúng." : "Not quite."}</p>
              <button
                type="button"
                className="cr-btn cr-btn-primary"
                onClick={() => {
                  setPos(start);
                  setPicked(null);
                  setFailed(false);
                }}
              >
                ↩ {vi ? "Thử lại" : "Try again"}
              </button>
            </div>
          )}
          {xpMsg && <p className="cr-msg">{xpMsg}</p>}
          <div className="cr-row">
            <button type="button" className="cr-btn cr-btn-sm" onClick={doLike}>
              {liked ? "❤️" : "🤍"} {likes}
            </button>
            <button type="button" className="cr-btn cr-btn-sm" onClick={doShare}>
              📤 {vi ? "Chia sẻ" : "Share"}
            </button>
            <button
              type="button"
              className="cr-btn cr-btn-sm"
              onClick={() => onRemix(card)}
            >
              🔀 Remix
            </button>
            {mine && (
              <>
                <button type="button" className="cr-btn cr-btn-sm" onClick={doRename}>
                  ✏️ {vi ? "Đổi tên" : "Rename"}
                </button>
                <button type="button" className="cr-btn cr-btn-sm" onClick={doDelete}>
                  🗑 {vi ? "Xóa" : "Delete"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateView({
  lang,
  seed,
  onDone,
  onCancel,
}: {
  lang: Lang;
  seed: { pos: string; title: string } | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const vi = lang === "vi";
  const seedState = useMemo(() => (seed ? parsePosition(seed.pos) : null), [seed]);
  const [size, setSize] = useState(seedState?.size ?? 15);
  const [board, setBoard] = useState<BoardT>(() =>
    seedState ? stateToBoard(seedState) : emptyBoard(15)
  );
  const [turn, setTurn] = useState<Color>(
    seedState ? (seedState.turn === 1 ? "x" : "o") : "x"
  );
  const [tool, setTool] = useState<"x" | "o" | "erase">("x");
  const [title, setTitle] = useState(seed?.title ?? "");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const changeSize = (n: number) => {
    setSize(n);
    setBoard(emptyBoard(n));
  };

  const onSquareClick = (sq: number) => {
    const r = Math.floor(sq / size);
    const c = sq % size;
    setBoard((b) => {
      const next = b.map((row) => row.slice());
      next[r][c] =
        tool === "erase"
          ? null
          : { color: tool === "x" ? ("x" as const) : ("o" as const) };
      return next;
    });
    setMsg("");
  };

  /** Engine verification: position ongoing + side to move has a win. */
  const verify = (): { ok: boolean; wins: number[]; why?: string } => {
    const cells = new Int8Array(size * size);
    let stones = 0;
    board.forEach((row, y) =>
      row.forEach((p, x) => {
        if (p) {
          cells[y * size + x] = p.color === "x" ? 1 : 2;
          stones++;
        }
      })
    );
    if (stones < 2)
      return { ok: false, wins: [], why: vi ? "Đặt ít nhất 2 quân." : "Place at least 2 stones." };
    const st = createFromBoard(size, cells, playerOfColor(turn));
    if (st.result.status !== "ongoing")
      return {
        ok: false,
        wins: [],
        why: vi
          ? "Thế cờ đã có người thắng sẵn — không hợp lệ."
          : "The position is already decided — not valid.",
      };
    const wins: number[] = [];
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === 0 && winsAt(st, i, st.turn)) wins.push(i);
    }
    if (wins.length === 0)
      return {
        ok: false,
        wins,
        why: vi
          ? "Bên đi chưa có nước thắng ngay nào — hãy tạo một hàng 4 chờ nối."
          : "The side to move has no immediate win yet — build a four waiting to connect.",
      };
    return { ok: true, wins };
  };

  const publish = async () => {
    const v = verify();
    if (!v.ok) {
      setMsg(v.why ?? "");
      return;
    }
    setBusy(true);
    try {
      const st = boardToState(board, turn);
      await publishCommunityPuzzle({
        title: title.trim(),
        pos: serializePosition(st),
        boardSize: size,
        solution: v.wins.join(" "),
      });
      onDone();
    } catch {
      setMsg(vi ? "Đăng thất bại — thử lại sau." : "Publish failed — try again later.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cr-layout">
      <div className="cr-board-area">
        <div className="cr-board-fit">
          <Board
            board={board}
            size={size}
            flipped={false}
            interactive
            boardLabel={vi ? "Tạo thế cờ" : "Create puzzle"}
            onSquareClick={onSquareClick}
          />
        </div>
      </div>
      <div className="cr-panel">
        <div className="cr-panel-head">
          <button type="button" className="cr-btn cr-btn-sm" onClick={onCancel}>
            ← {vi ? "Hủy" : "Cancel"}
          </button>
          <div className="cr-puzzle-title">🧩 {vi ? "Tạo thế cờ" : "Create puzzle"}</div>
        </div>
        <div className="cr-puzzle-body">
          <div className="cr-size-row" role="group" aria-label={vi ? "Cỡ bàn" : "Board size"}>
            {BOARD_SIZES.map((n) => (
              <button
                key={n}
                type="button"
                className={`cr-btn cr-size-btn${size === n ? " active" : ""}`}
                onClick={() => changeSize(n)}
              >
                {n}×{n}
              </button>
            ))}
          </div>
          <div className="cr-row">
            <button
              type="button"
              className={`cr-btn cr-btn-sm${tool === "x" ? " cr-btn-primary" : ""}`}
              onClick={() => setTool("x")}
            >
              ✖ {vi ? "Đặt X" : "Place X"}
            </button>
            <button
              type="button"
              className={`cr-btn cr-btn-sm${tool === "o" ? " cr-btn-primary" : ""}`}
              onClick={() => setTool("o")}
            >
              ⭕ {vi ? "Đặt O" : "Place O"}
            </button>
            <button
              type="button"
              className={`cr-btn cr-btn-sm${tool === "erase" ? " cr-btn-primary" : ""}`}
              onClick={() => setTool("erase")}
            >
              🧽 {vi ? "Xóa" : "Erase"}
            </button>
            <button
              type="button"
              className="cr-btn cr-btn-sm"
              onClick={() => {
                setBoard(emptyBoard(size));
                setMsg("");
              }}
            >
              🗑 {vi ? "Xóa hết" : "Clear"}
            </button>
          </div>
          <div className="cr-row">
            <span>{vi ? "Lượt đi:" : "To move:"}</span>
            <button
              type="button"
              className={`cr-btn cr-btn-sm${turn === "x" ? " cr-btn-primary" : ""}`}
              onClick={() => setTurn("x")}
            >
              X
            </button>
            <button
              type="button"
              className={`cr-btn cr-btn-sm${turn === "o" ? " cr-btn-primary" : ""}`}
              onClick={() => setTurn("o")}
            >
              O
            </button>
          </div>
          <input
            className="cr-input"
            value={title}
            maxLength={60}
            placeholder={vi ? "Tên thế cờ…" : "Puzzle title…"}
            onChange={(e) => setTitle(e.target.value)}
          />
          <p className="cr-hint">
            {vi
              ? "Máy kiểm chứng trước khi đăng: thế cờ chưa ngã ngũ và bên đi phải có ít nhất một nước nối 5 thắng ngay. Mọi ô thắng đều được chấp nhận khi giải."
              : "Verified before publishing: the position must be undecided and the side to move must have an immediate five. Every winning cell counts as a solution."}
          </p>
          {msg && <p className="cr-msg">{msg}</p>}
          <button
            type="button"
            className="cr-btn cr-btn-primary"
            disabled={busy}
            onClick={publish}
          >
            🚀 {vi ? "Kiểm chứng & đăng" : "Verify & publish"}
          </button>
        </div>
      </div>
    </div>
  );
}
