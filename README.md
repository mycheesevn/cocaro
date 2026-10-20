# ✖️ Gomoku vs Computer / Cờ Ca-rô

Play Cờ Ca-rô (Gomoku) against the computer, right in the browser.
Built with Next.js and deployed on Vercel. Part of the SynerWorlds
family of board games — https://cocaro.synerworlds.com

## The game

Vietnamese caro rules on a white ô-ly notebook board:

- Board sizes **10×10 / 15×15 / 20×20** (15 is the classic default)
- X moves first; connect five in a row (any direction) to win
- Exactly five blocked at **both** ends does **not** win (the board
  edge counts as blocked); **six or more always wins**
- No renju forbidden moves; a full board with no five is a draw
- Hand-written TypeScript engine + 12-level AI, verified by an
  automated test suite (`node tools/verify-caro.mjs`)

## Features

- **Vs computer**: 12 difficulty levels, real swap-sides, real hint
  (strong-level AI), undo, clocks, eval bar, resume-in-progress
- **Board setup editor** with saved setups; computer-vs-computer only
  inside Setup (family ruling)
- **Daily puzzle + Puzzle Rush** (win-in-1 / block-or-lose positions
  with engine-computed solution sets) and **community puzzles** with
  author credit
- **Playbook library**: interactive, engine-verified lessons
- **Rooms**: real-time play with a host-chosen board size, private
  room chat, WebRTC voice chat (spectators may listen, opt-in), room
  deletion by the owner, tournaments, spectators, per-move comments
- **Correspondence** games, friends + challenges, Elo + XP + quests +
  daily check-in, paginated leaderboard and history with rating graph
- **Share cards** and full **replay video export** (intro/outro with
  the site CTA, celebration on a decisive finish)
- **Push notifications** (challenges, your turn, correspondence)
- Bilingual UI — Vietnamese default, English toggle

## Stack

Next.js (App Router) + Supabase (shared family project, `cr_` table
prefix) + Vercel. SQL migrations live in `supabase/migrations/`
(001→011); see `supabase/migrations/LAUNCH_NOTES.md` for the launch
checklist.
