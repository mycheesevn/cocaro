// Thư viện Bí Kíp — interactive Gomoku playbook lessons.
// Content model follows the boardgame-engagement skill
// (references/library.md). EVERY lesson line is machine-verified
// against the real engine before shipping (tools/verify-lessons.ts):
// each step move is legal in sequence, every quiz=win step really
// ends the game, and every "dead five" demo step really does NOT.
//
// Rules reflected here (Vietnamese caro): X moves first; exactly five
// blocked at BOTH ends does not win (an edge counts as blocked);
// six or more (overline) always wins; no renju forbidden moves.
//
// Lesson ids are prefixed "caro-" — the shared `library_progress`
// table also holds other games' rows, so ids must be unique across games.

import { idxOf } from "./engine";
import type { Color } from "./engineApi";

export interface LText { vi: string; en: string }

export type QuizKind = "exact" | "anyOf" | "win";

export interface LibraryStep {
  /** Cell index placed by this step (auto-played, or the quiz target). */
  move?: number;
  /** For quiz="anyOf": the set of acceptable cells. */
  accept?: number[];
  /** Explanation shown for this step (or the "correct!" text after a quiz). */
  text: LText;
  /** If set, the user must find and play a move to advance. */
  quiz?: QuizKind;
  /** Quiz prompt (defaults to text when absent). */
  quizPrompt?: LText;
}

export interface LibraryLesson {
  id: string;
  title: LText;
  intro: LText;
  size: number;
  /** Stones as [x, y, who] triples; who: 1 = X, 2 = O. */
  stones: [number, number, 1 | 2][];
  startTurn: Color;
  steps: LibraryStep[];
  outro: LText;
}

export interface LibraryChapter {
  id: string;
  icon: string;
  title: LText;
  subtitle: LText;
  lessons: LibraryLesson[];
}

const X = 1 as const;
const O = 2 as const;
/** Cell index on a 15×15 board from (x = column, y = row). */
const C = (x: number, y: number) => idxOf(15, x, y);

export const LIBRARY: LibraryChapter[] = [
  {
    id: "caro-basics",
    icon: "📕",
    title: { vi: "Cơ bản", en: "Basics" },
    subtitle: {
      vi: "Đi trước, xây hàng và chặn hàng — nền tảng của mọi ván ca-rô.",
      en: "Move first, build lines and block them — the foundation of every game.",
    },
    lessons: [
      {
        id: "caro-first-stone",
        title: { vi: "Nước đi đầu tiên", en: "The first stone" },
        intro: {
          vi: "X luôn đi trước. Nước mở đầu mạnh nhất thường là ô trung tâm — từ đó X tỏa ra mọi hướng. Hãy thử!",
          en: "X always moves first. The strongest opening is usually the center — from there X radiates in every direction. Try it!",
        },
        size: 15,
        stones: [],
        startTurn: "x",
        steps: [
          {
            move: C(7, 7),
            text: { vi: "Chính xác! Ô trung tâm (H8) là điểm tỏa sáng nhất bàn cờ.", en: "Exactly! The center (H8) is the brightest point on the board." },
            quiz: "exact",
            quizPrompt: { vi: "Đặt X vào ô trung tâm bàn cờ.", en: "Place X on the center cell." },
          },
          {
            move: C(7, 8),
            text: { vi: "O đáp ngay cạnh trung tâm — tranh chấp khu vực giữa bàn ngay từ đầu.", en: "O answers right next to the center — the middle is contested from the start." },
          },
          {
            accept: [C(6, 6), C(7, 6), C(8, 6), C(6, 7), C(8, 7), C(6, 8), C(8, 8)],
            text: { vi: "Tốt! Xây gần quân đầu tiên để tạo thành các hàng chờ nối.", en: "Good! Build near your first stone to form lines waiting to connect." },
            quiz: "anyOf",
            quizPrompt: { vi: "Đặt X vào bất kỳ ô nào kề quân X đầu tiên.", en: "Place X on any cell next to your first X." },
          },
        ],
        outro: {
          vi: "Nhớ: X đi trước, trung tâm là ô quý nhất, và các quân nên đứng gần nhau để nối thành hàng.",
          en: "Remember: X moves first, the center is the most valuable cell, and stones should stand close so they can connect into lines.",
        },
      },
      {
        id: "caro-open-three",
        title: { vi: "Thế ba hở", en: "The open three" },
        intro: {
          vi: "Ba quân liền nhau mà hai đầu còn trống gọi là 'ba hở' — thế tấn công nguy hiểm vì đối thủ không chặn hết được khi nó thành bốn hở.",
          en: "Three in a row with both ends empty is an 'open three' — a dangerous attacking shape, because once it becomes an open four it cannot be stopped.",
        },
        size: 15,
        stones: [
          [5, 7, X], [6, 7, X], [7, 7, X],
          [3, 3, O], [11, 10, O], [9, 4, O],
        ],
        startTurn: "x",
        steps: [
          {
            accept: [C(4, 7), C(8, 7)],
            text: { vi: "Đúng rồi! Bốn hở: cả hai đầu đều trống nên O chặn một đầu, X vẫn nối đầu kia thành 5.", en: "Right! An open four: both ends are empty, so if O blocks one end, X still connects the other into five." },
            quiz: "anyOf",
            quizPrompt: { vi: "Nối dài hàng 3 thành hàng 4 hở (đặt vào một trong hai đầu).", en: "Extend the three into an open four (play either end)." },
          },
        ],
        outro: {
          vi: "Hàng 4 hở là đòn gần như không đỡ nổi. Vì vậy khi thấy đối thủ có ba hở, hãy chặn NGAY từ sớm!",
          en: "An open four is nearly unstoppable. So when your opponent has an open three, block it EARLY!",
        },
      },
      {
        id: "caro-block-in-time",
        title: { vi: "Chặn cho kịp", en: "Block in time" },
        intro: {
          vi: "O đang có hàng 4, nhưng một đầu đã bị X chặn sẵn. Chỉ còn đúng một ô cứu được ván cờ — tìm ra nó!",
          en: "O has a four, but one end is already blocked by X. Exactly one cell saves the game — find it!",
        },
        size: 15,
        stones: [
          [5, 7, O], [6, 7, O], [7, 7, O], [8, 7, O], [4, 7, X],
          [3, 11, X], [11, 4, X], [10, 11, X],
        ],
        startTurn: "x",
        steps: [
          {
            accept: [C(9, 7)],
            text: { vi: "Chuẩn xác! Chặn đầu còn lại là O hết đường thắng. Nếu chậm một nước, O nối 5 và ván cờ kết thúc.", en: "Perfect! Blocking the other end leaves O no way to win. One move slower and O connects five — game over." },
            quiz: "anyOf",
            quizPrompt: { vi: "Chặn nước thắng của O ngay bây giờ!", en: "Block O's winning move right now!" },
          },
        ],
        outro: {
          vi: "Quy tắc vàng: thấy hàng 4 của đối thủ thì đếm số đầu hở. Còn 1 đầu hở → chặn ngay; 2 đầu hở → chỉ còn cách thắng trước họ.",
          en: "Golden rule: when you see an enemy four, count its open ends. One open end → block it now; two open ends → your only hope is to win first.",
        },
      },
    ],
  },
  {
    id: "caro-tactics",
    icon: "📗",
    title: { vi: "Chiến thuật", en: "Tactics" },
    subtitle: {
      vi: "Đòn đôi, luật chặn hai đầu và nước thắng quyết định.",
      en: "Double threats, the blocked-ends rule, and the decisive winning move.",
    },
    lessons: [
      {
        id: "caro-double-three",
        title: { vi: "Đòn ba–ba", en: "The double three" },
        intro: {
          vi: "Đòn phối hợp kinh điển: một nước đi tạo ra HAI hàng 3 hở cùng lúc. Đối thủ chỉ chặn được một — hàng còn lại thành 4 hở và kết liễu ván cờ.",
          en: "The classic combination: one move creates TWO open threes at once. The opponent can block only one — the other becomes an open four and finishes the game.",
        },
        size: 15,
        stones: [
          [7, 5, X], [7, 6, X], [5, 7, X], [6, 7, X],
          [3, 3, O], [12, 9, O], [10, 12, O],
        ],
        startTurn: "x",
        steps: [
          {
            move: C(7, 7),
            text: { vi: "Đòn ba–ba! Ô giao nhau (7,7) hoàn thiện cả hàng ngang lẫn hàng dọc thành hai thế 3 hở.", en: "Double three! The crossing cell completes both the row and the column into two open threes." },
            quiz: "exact",
            quizPrompt: { vi: "Tìm ô giao nhau tạo hai hàng 3 hở cùng lúc.", en: "Find the crossing cell that makes two open threes at once." },
          },
          {
            move: C(8, 7),
            text: { vi: "O chặn một đầu của hàng ngang — nhưng hàng dọc vẫn còn nguyên!", en: "O blocks one end of the row — but the column is untouched!" },
          },
          {
            accept: [C(7, 4), C(7, 8)],
            text: { vi: "Bốn hở ở hàng dọc! O không thể chặn cả hai đầu — nước sau X thắng chắc.", en: "An open four in the column! O cannot block both ends — X wins next move for sure." },
            quiz: "anyOf",
            quizPrompt: { vi: "Biến hàng dọc thành 4 hở.", en: "Turn the column into an open four." },
          },
        ],
        outro: {
          vi: "Ba–ba là đòn phối hợp mạnh nhất của ca-rô tự do (không cấm như renju chuyên nghiệp). Hãy luôn tìm ô giao nhau!",
          en: "The double three is the strongest combination in free-style caro (not banned as in professional renju). Always look for the crossing cell!",
        },
      },
      {
        id: "caro-blocked-ends",
        title: { vi: "Chặn hai đầu & quá năm", en: "Blocked ends & overlines" },
        intro: {
          vi: "Luật Việt Nam có một nét rất riêng: nối đúng 5 quân mà bị chặn CẢ hai đầu thì KHÔNG thắng — nhưng nối từ 6 quân trở lên thì luôn thắng. Xem tận mắt nhé!",
          en: "Vietnamese rules have a signature twist: exactly five blocked at BOTH ends does NOT win — but six or more always wins. Watch it happen!",
        },
        size: 15,
        stones: [
          [5, 7, X], [6, 7, X], [7, 7, X], [8, 7, X],
          [4, 7, O], [10, 7, O],
          [5, 3, X], [6, 3, X], [7, 3, X], [9, 3, X], [10, 3, X],
          [4, 3, O], [11, 3, O],
        ],
        startTurn: "x",
        steps: [
          {
            move: C(9, 7),
            text: { vi: "X nối đủ 5 quân ở hàng giữa… nhưng O đã chặn cả hai đầu (và biên bàn cũng tính là chặn) — theo luật Việt Nam, hàng 5 này KHÔNG thắng! Ván cờ tiếp tục.", en: "X connects five in the middle row… but O blocks both ends (the board edge counts as blocked too) — under Vietnamese rules this five does NOT win! The game goes on." },
          },
          {
            move: C(12, 12),
            text: { vi: "O đi một nước chờ ở góc xa.", en: "O plays a waiting move in the far corner." },
          },
          {
            accept: [C(8, 3)],
            text: { vi: "Sáu quân liền nhau! Dù hai đầu cũng bị chặn, 'quá năm' (từ 6 quân) LUÔN thắng theo luật Việt Nam.", en: "Six in a row! Even with both ends blocked, an overline (6+) ALWAYS wins under Vietnamese rules." },
            quiz: "win",
            quizPrompt: { vi: "Lấp ô trống ở hàng trên cùng để thắng bằng hàng 6.", en: "Fill the gap in the top row to win with a line of six." },
          },
        ],
        outro: {
          vi: "Ghi nhớ: đúng 5 + chặn 2 đầu = chưa thắng; 6 trở lên = thắng luôn. Đừng vội mừng khi thấy mình nối được 5!",
          en: "Remember: exactly 5 + both ends blocked = not yet a win; 6 or more = always a win. Don't celebrate a five too early!",
        },
      },
      {
        id: "caro-finish-it",
        title: { vi: "Kết liễu trong 1 nước", en: "Finish in one move" },
        intro: {
          vi: "Bài tập tổng kết: X có hai đường cùng chờ một ô. Tìm ô thắng quyết định!",
          en: "Final exercise: X has two lines waiting on the same cell. Find the decisive winning cell!",
        },
        size: 15,
        stones: [
          [5, 7, X], [6, 7, X], [7, 7, X], [8, 7, X],
          [9, 4, X], [9, 5, X], [9, 6, X], [9, 8, X],
          [4, 7, O], [2, 3, O], [12, 10, O], [6, 12, O],
        ],
        startTurn: "x",
        steps: [
          {
            accept: [C(9, 7)],
            text: { vi: "Một ô — hai hàng 5! Đây chính là thế cờ của câu đố win-006 trong mục Thế cờ hằng ngày.", en: "One cell — two lines of five! This is puzzle win-006 from the Daily puzzle." },
            quiz: "win",
            quizPrompt: { vi: "Tìm nước thắng ngay cho X.", en: "Find the immediate win for X." },
          },
        ],
        outro: {
          vi: "Bạn đã nắm đủ vũ khí: trung tâm, ba hở, chặn kịp lúc, đòn ba–ba và luật chặn hai đầu. Ra trận thôi!",
          en: "You now hold every weapon: the center, open threes, timely blocks, the double three, and the blocked-ends rule. To battle!",
        },
      },
    ],
  },
];

export const ALL_LESSONS = LIBRARY.flatMap((c) => c.lessons);

export function findLesson(id: string) {
  return ALL_LESSONS.find((l) => l.id === id);
}

export function allLessonIds(): string[] {
  return ALL_LESSONS.map((l) => l.id);
}

export function lessonIndex(id: string): number {
  return ALL_LESSONS.findIndex((l) => l.id === id);
}

export function nextLessonId(id: string): string | null {
  const i = lessonIndex(id);
  return i >= 0 && i + 1 < ALL_LESSONS.length ? ALL_LESSONS[i + 1].id : null;
}

export function isLessonUnlocked(id: string, completed: string[]): boolean {
  const i = lessonIndex(id);
  if (i <= 0) return true;
  return completed.includes(ALL_LESSONS[i - 1].id);
}
