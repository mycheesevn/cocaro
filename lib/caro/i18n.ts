// Bilingual UI strings (English / Vietnamese) for Caro (Cờ Ca-rô).

import type { Lang } from "./engineApi";

export interface Strings {
  title: string;
  subtitle: string;
  copyright: string;
  level: string;
  youPlay: string;
  xFirst: string;
  oSecond: string;
  undo: string;
  newGame: string;
  switchSides: string;
  xName: string;
  oName: string;
  toMove: (colorName: string, forcedCapture: boolean) => string;
  winElimination: (winnerName: string) => string;
  winNoMoves: (winnerName: string) => string;
  drawRepetition: () => string;
  drawQuiet: () => string;
  drawMaterial: () => string;
  thinking: string;
  thinkMeta: (levelLabel: string, depth: number) => string;
  computer: string;
  strength: string;
  lastSearch: string;
  searchStats: (depth: number, nodes: string, secs: string) => string;
  captured: string;
  youTook: string;
  computerTook: string;
  boardSize: string;
  stonesOnBoard: string;
  moves: string;
  noMoves: string;
  howToPlay: string;
  helpBullets: string[];
  boardLabel: string;
  levelLabel: (n: number) => string;
  levelDesc: string[];
  setupCvc: string;
  setupsTitle: string;
  setupsSave: string;
  setupsNamePh: string;
  setupsLoad: string;
  setupsEmpty: string;
  setupsUnnamed: string;
  setupsSaveFailed: string;
  cvcTitle: string;
  cvcHint: string;
  cvcThinking: string;
  cvcTurn: string;
  cvcPlay: string;
  cvcPause: string;
  cvcRestart: string;
  cvcBackToSetup: string;
  cvcSpeed: string;
  cvcXWon: string;
  cvcOWon: string;
  cvcDrawn: string;
  cvcReasonWin: string;
  cvcReasonDraw: string;
  cvcReasonCap: string;
  winBadge: string;
  replaySiteCta: string;
  hint: string;
  hintBusy: string;
  hintToast: (move: string) => string;
  timeControl: string;
  noTimeControl: string;
  minutes: (n: number) => string;
  flagged: (colorName: string) => string;
  restoreToast: string;
  authLogin: string;
  authSignup: string;
  authContinueWith: string;
  authOr: string;
  authDisplayName: string;
  authDisplayNamePh: string;
  authPassword: string;
  authInvalid: string;
  authCheckEmail: string;
  authClose: string;
  authNoAccount: string;
  authHaveAccount: string;
  stats: string;
  statsTotalPlays: string;
  statsGuests: string;
  statsFinished: string;
  statsAbandoned: string;
  statsMembers: string;
  statsNewMembers: string;
  statsToday: string;
  statsThisWeek: string;
  statsThisMonth: string;
  statsPlays: string;
  statsByDay: string;
  statsByWeek: string;
  statsByMonth: string;
  statsByYear: string;
  statsLoading: string;
  statsNotConfigured: string;
  videoExport: string;
  videoTitle: string;
  videoDesc: string;
  videoMoves: (n: number) => string;
  videoStart: string;
  videoRecording: string;
  videoCancel: string;
  videoShare: string;
  videoDownload: string;
  videoClose: string;
  videoDone: string;
  videoError: string;
  videoSpeed: string;
  videoSpeedSlow: string;
  videoSpeedNormal: string;
  videoSpeedFast: string;
  videoMic: string;
  videoMicDenied: string;
  setupTitle: string;
  setupPieces: string;
  setupMove: string;
  setupErase: string;
  setupHint: string;
  setupTurn: string;
  setupStart: string;
  setupReset: string;
  setupClear: string;
  setupErrEmpty: string;
  setupErrFinished: string;
  setupErrNoMoves: string;
  libTagline: string;
  libProgress: (done: number, total: number) => string;
  libLessons: (done: number, total: number) => string;
  libUnlockHint: (prevChapter: string) => string;
  libBack: string;
  libStep: (i: number, n: number) => string;
  libDone: string;
  libShowMove: string;
  libFindMove: string;
  libTryAgain: string;
  libExploreDone: string;
  libCompleteLesson: string;
  libCelebration: string;
  libNextLesson: string;
  libBackToLibrary: string;
  /* Profile modal */
  profile: string;
  profileFullName: string;
  profileBirthDate: string;
  profileCity: string;
  profileCountry: string;
  profileAvatar: string;
  profileChangeAvatar: string;
  profileUploading: string;
  profileUsername: string;
  profileEmail: string;
  profileSave: string;
  profileSaved: string;
  achProfileTitle: string;
  achShare: string;
  shareDone: string;
  shareDownloaded: string;
  leaderboard: string;
  leaderboardLogin: string;
  peakRating: string;
  dayStreak: string;
  guestTeaserGames: (n: number) => string;
  guestTeaserPuzzles: (n: number) => string;
  guestTeaserCta: string;
  leaderboardEmpty: string;
  topPlayers: string;
  noName: string;
  you: string;
  wins: string;
  losses: string;
  draws: string;
  ratingProgress: string;
  winRate: string;
  gamesPlayed: string;
  loading: string;
  achRankTitle: (rank: number) => string;
  xpToNext: (xp: number, lvl: number) => string;
  ambStats: (invites: number, xp: number) => string;
  referralTitle: string;
  referralDesc: string;
  referralCopy: string;
  referralCopied: string;
  referralShare: string;
  changePassword: string;
  newPassword: string;
  confirmPassword: string;
  passwordChanged: string;
  passwordMismatch: string;
  passwordTooShort: string;
  /* Friends view */
  friendsTitle: string;
  friendsChallengeIncoming: string;
  friendsChallengeFrom: (name: string) => string;
  friendsAccept: string;
  friendsDecline: string;
  friendsEmpty: string;
  friendsOnline: string;
  friendsInMatch: string;
  friendsWatch: string;
  friendsChallengeBtn: string;
  friendsUnfriend: string;
  friendsLoading: string;
  friendsSignIn: string;
  friendsActionError: string;
  hubChallengeTitle: (name: string) => string;
  hubChallengeSend: string;
  hubChallengeLater: string;
  hubChallengeError: string;
  hubChallengeNotFound: string;
  ssoError: string;
  recordFailed: string;
  sessionExpired: string;
  roomPromote: string;
  roomPromoMembers: (n: number) => string;
  roomPromoFooter: string;
  roomPromoCodeLabel: string;
  // Library (Bí Kíp)
  library: string;
  step: string;
  tryAgain: string;
  correct: string;
  back: string;
  nextLesson: string;
  backToLibrary: string;
  // Puzzles
  puzzlePrompt: string;
  puzzleSolved: string;
  share: string;
  puzzleRush: string;
  puzzleFailed: string;
  puzzleAlreadySolved: string;
  // Puzzle Rush
  rushOver: string;
  score: string;
  best: string;
  playAgain: string;
  // Video export
  gameName: string;
  playNow: string;
  youWin: string;
  youLose: string;
  draw: string;
}

export const STR: Record<Lang, Strings> = {
  en: {
    title: "✖️ Gomoku",
    subtitle: "Play against the computer",
    copyright: "Copyright by SynerWork Inc. All rights reserved.",
    level: "Level",
    youPlay: "You play",
    xFirst: "X (first)",
    oSecond: "O (second)",
    undo: "Undo",
    newGame: "New game",
    switchSides: "🔄 Switch sides",
    xName: "X",
    oName: "O",
    toMove: (c) => `${c} to move`,
    winElimination: (w) => `${w} wins — five in a row!`,
    winNoMoves: (w) => `${w} wins — five in a row!`,
    drawRepetition: () => "Draw — the board is full, nobody connected five!",
    drawQuiet: () => "Draw — the board is full, nobody connected five!",
    drawMaterial: () => "Draw — the board is full, nobody connected five!",
    thinking: "Computer is thinking",
    thinkMeta: (lvl, d) => `· ${lvl} · depth ${d}`,
    computer: "Computer",
    strength: "Strength",
    lastSearch: "Last search",
    searchStats: (d, n, s) => `depth ${d} · ${n} nodes · ${s}s`,
    captured: "On board",
    boardSize: "Board size",
    stonesOnBoard: "Marks on board",
    youTook: "Your marks",
    computerTook: "Computer marks",
    moves: "Moves",
    noMoves: "No moves yet.",
    howToPlay: "How to play",
    helpBullets: [
      "Tap any empty intersection to place your mark. X moves first; players alternate.",
      "Connect FIVE marks in a row — horizontally, vertically, or diagonally — to win.",
      "Vietnamese rule: exactly five blocked at BOTH ends does NOT win (the board edge counts as blocked). Six or more in a row always wins.",
      "Defense wins games: block the opponent's open fours at once, and watch for double-three attacks.",
      "If the board fills with no five in a row, the game is a draw.",
    ],
    boardLabel: "Gomoku board",
    levelLabel: (n) => `Level ${n}`,
    levelDesc: [
      "Absolute beginner", "Beginner", "Casual", "Improving", "Club player",
      "Strong club player", "Expert", "Master", "Grandmaster", "Relentless",
      "Nightmare", "Unbeatable",
    ],
    setupCvc: "🤖 Computer vs Computer",
    setupsTitle: "💾 Saved setups",
    setupsSave: "Save this position",
    setupsNamePh: "Name this setup…",
    setupsLoad: "Load",
    setupsEmpty: "No saved setups yet.",
    setupsUnnamed: "Setup",
    setupsSaveFailed: "Couldn't save the setup.",
    cvcTitle: "Computer vs Computer",
    cvcHint: "Both engines play at the chosen level to solve this position.",
    cvcThinking: "Engine thinking…",
    cvcTurn: "To move",
    cvcPlay: "▶ Resume",
    cvcPause: "⏸ Pause",
    cvcRestart: "↻ Restart",
    cvcBackToSetup: "↩ Back to setup",
    cvcSpeed: "Speed",
    cvcXWon: "🏆 X wins!",
    cvcOWon: "🏆 O wins!",
    cvcDrawn: "🤝 Draw!",
    cvcReasonWin: "Win",
    cvcReasonDraw: "Draw — board full",
    cvcReasonCap: "Board filled up",
    winBadge: "YOU WIN!",
    replaySiteCta: "👉 Play free at cocaro.synerworlds.com",
    hint: "💡 Hint",
    hintBusy: "💡 …",
    hintToast: (m) => `💡 Hint: ${m}`,
    timeControl: "Time",
    noTimeControl: "None",
    minutes: (n) => `${n} min`,
    flagged: (c) => `${c} lost on time!`,
    restoreToast: "↩️ Restored your unfinished game.",
    authLogin: "Log in",
    authSignup: "Sign up",
    authContinueWith: "Continue with",
    authOr: "or",
    authDisplayName: "Display name (optional)",
    authDisplayNamePh: "Your name on the leaderboard",
    authPassword: "Password",
    authInvalid: "Enter a valid email and a password of 6+ characters.",
    authCheckEmail: "Account created! Check your email to confirm, then log in.",
    authClose: "Close",
    authNoAccount: "New here?",
    authHaveAccount: "Have an account?",
    stats: "Statistics",
    statsTotalPlays: "Total plays",
    statsGuests: "Guests",
    statsFinished: "Finished",
    statsAbandoned: "abandoned",
    statsMembers: "Members",
    statsNewMembers: "New members",
    statsToday: "Today",
    statsThisWeek: "This week",
    statsThisMonth: "This month",
    statsByDay: "Day",
    statsByWeek: "Week",
    statsByMonth: "Month",
    statsByYear: "Year",
    statsPlays: "Plays",
    statsLoading: "Loading…",
    statsNotConfigured: "Statistics are not available yet.",
    videoExport: "Export video",
    videoTitle: "Export game video",
    videoDesc: "Record the whole game as a video clip with sound to share.",
    videoMoves: (n: number) => `Game has ${n} moves`,
    videoStart: "Start recording",
    videoRecording: "Recording… keep the screen on.",
    videoCancel: "Cancel",
    videoShare: "Share",
    videoDownload: "Download",
    videoClose: "Close",
    videoDone: "Done! Your video is ready.",
    videoError: "Couldn't record video on this device.",
    videoSpeed: "Speed",
    videoSpeedSlow: "Slow",
    videoSpeedNormal: "Normal",
    videoSpeedFast: "Fast",
    videoMic: "🎤 Record voice commentary",
    videoMicDenied: "Couldn't access the microphone.",
    setupTitle: "Board setup",
    setupPieces: "Pieces",
    setupMove: "Move",
    setupErase: "Erase",
    setupHint: "Choose X or O, then tap intersections to place marks. With Move, tap a mark and then its destination.",
    setupTurn: "First move",
    setupStart: "▶ Play this position",
    setupReset: "Reset",
    setupClear: "Clear",
    setupErrEmpty: "Place at least two marks on the board.",
    setupErrFinished: "This position is already decided. Change it so the game can continue.",
    setupErrNoMoves: "No empty intersection left for the side to move.",
    libTagline: "An interactive journey: tactics, traps, breakthroughs and endgames. Complete lessons to unlock the next chapter.",
    libProgress: (d, t) => `${d} / ${t} lessons completed`,
    libLessons: (d, t) => `${d} / ${t} lessons`,
    libUnlockHint: (prev) => `Finish “${prev}” to unlock`,
    libBack: "← Back",
    libStep: (i, n) => `Step ${i} / ${n}`,
    libDone: "Completed",
    libShowMove: "Show move ▶",
    libFindMove: "Find the move!",
    libTryAgain: "Not that one — try again!",
    libExploreDone: "Done exploring",
    libCompleteLesson: "Complete lesson",
    libCelebration: "Lesson complete! Your progress has been saved.",
    libNextLesson: "Next lesson →",
    libBackToLibrary: "Back to library",
    /* Profile modal */
    profile: "Profile",
    profileFullName: "Full name",
    profileBirthDate: "Date of birth",
    profileCity: "City",
    profileCountry: "Country",
    profileAvatar: "Avatar",
    profileChangeAvatar: "Change photo",
    profileUploading: "Uploading…",
    profileUsername: "Leaderboard name",
    profileEmail: "Email",
    profileSave: "Save",
    profileSaved: "Profile saved ✓",
    achProfileTitle: "My caro achievements",
    achShare: "📤 Brag",
    shareDone: "Shared! 🎉",
    shareDownloaded: "Image saved + link copied 📋",
    leaderboard: "Leaderboard",
    leaderboardLogin: "Log in to see the leaderboard.",
    peakRating: "peak",
    dayStreak: "day streak",
    guestTeaserGames: (n: number) => `You've played ${n} games as a guest`,
    guestTeaserPuzzles: (n: number) => `solved ${n} puzzles as a guest`,
    guestTeaserCta: "Log in free to save your progress and play with friends!",
    leaderboardEmpty: "No players yet — be the first!",
    topPlayers: "Top players",
    noName: "Unnamed",
    you: "you",
    wins: "wins",
    losses: "losses",
    draws: "draws",
    ratingProgress: "Rating progress",
    winRate: "win rate",
    gamesPlayed: "games",
    loading: "Loading…",
    achRankTitle: (rank) => `🏆 Ranked #${rank} on the leaderboard!`,
    xpToNext: (xp, lvl) => `${xp} XP to Lv ${lvl}`,
    ambStats: (invites: number, xp: number) =>
      `🎁 Ambassador: invited ${invites} ${invites === 1 ? "person" : "people"} · +${xp} XP earned`,
    referralTitle: "🎁 Invite friends",
    referralDesc:
      "Send your link to friends — when they log in and play 1 game, you both get +20 XP!",
    referralCopy: "Copy invite link",
    referralCopied: "Invite link copied! 📋",
    referralShare: "Share",
    changePassword: "Change password",
    newPassword: "New password",
    confirmPassword: "Confirm new password",
    passwordChanged: "Password changed ✓",
    passwordMismatch: "Passwords don't match",
    passwordTooShort: "Password must be at least 6 characters",
    friendsTitle: "👤 Friends",
    friendsChallengeIncoming: "⚔️ Challenges",
    friendsChallengeFrom: (name: string) => `⚔️ ${name} challenges you!`,
    friendsAccept: "Accept",
    friendsDecline: "Decline",
    friendsEmpty: "No friends yet. Add friends from the leaderboard or inside a room!",
    friendsOnline: "online",
    friendsInMatch: "in a match",
    friendsWatch: "👁 Watch",
    friendsChallengeBtn: "⚔️ Challenge",
    friendsUnfriend: "Remove",
    friendsLoading: "Loading…",
    friendsSignIn: "Sign in to add friends.",
    friendsActionError: "Something went wrong. Please try again.",
    hubChallengeTitle: (name) => `Challenge ${name}?`,
    hubChallengeSend: "⚔️ Challenge",
    hubChallengeLater: "Later",
    hubChallengeError: "Could not send the challenge. Please try again.",
    hubChallengeNotFound: "That player could not be found.",
    ssoError:
      "Couldn't sign in from the SynerWorlds link — please sign in manually.",
    recordFailed:
      "⚠️ Couldn't save this game to the server — it was not counted in Statistics.",
    sessionExpired:
      "Your session expired — please sign in again to keep recording results.",
    roomPromote: "Promote",
    roomPromoMembers: (n) => `${n} member${n === 1 ? "" : "s"} in room`,
    roomPromoFooter: "👉 Challenge me at cocaro.synerworlds.com",
    roomPromoCodeLabel: "Room code",
    library: "Playbook",
    step: "Step",
    tryAgain: "Not quite — try again!",
    correct: "Correct! 🎉",
    back: "Back",
    nextLesson: "Next lesson",
    backToLibrary: "Back to playbook",
    puzzlePrompt: "Find the winning move for",
    puzzleSolved: "Puzzle solved! Brilliant!",
    share: "Share",
    puzzleRush: "Puzzle Rush",
    puzzleFailed: "That doesn't win. Study the position and try again!",
    puzzleAlreadySolved: "You already solved today's puzzle.",
    rushOver: "Time's up!",
    score: "Score",
    best: "Best",
    playAgain: "Play again",
    gameName: "Gomoku",
    playNow: "Play now — free, no install!",
    youWin: "You win! 🏆",
    youLose: "You lose",
    draw: "Draw",
  },
  vi: {
    title: "✖️ Cờ Ca-rô",
    subtitle: "Chơi với máy tính",
    copyright: "Bản quyền thuộc về SynerWork Inc. Mọi quyền được bảo lưu.",
    level: "Cấp độ",
    youPlay: "Bạn cầm",
    xFirst: "X (đi trước)",
    oSecond: "O (đi sau)",
    undo: "Đi lại",
    newGame: "Ván mới",
    switchSides: "🔄 Đổi bên",
    xName: "X",
    oName: "O",
    toMove: (c) => `${c} đi`,
    winElimination: (w) => `${w} thắng — nối được 5 quân liên tiếp!`,
    winNoMoves: (w) => `${w} thắng — nối được 5 quân liên tiếp!`,
    drawRepetition: () => "Hòa — bàn cờ đã đầy, không ai nối được 5!",
    drawQuiet: () => "Hòa — bàn cờ đã đầy, không ai nối được 5!",
    drawMaterial: () => "Hòa — bàn cờ đã đầy, không ai nối được 5!",
    thinking: "Máy đang nghĩ",
    thinkMeta: (lvl, d) => `· ${lvl} · sâu ${d}`,
    computer: "Máy tính",
    strength: "Trình độ",
    lastSearch: "Lần tính cuối",
    searchStats: (d, n, s) => `sâu ${d} · ${n} nút · ${s} giây`,
    captured: "Trên bàn",
    boardSize: "Cỡ bàn",
    stonesOnBoard: "Quân trên bàn",
    youTook: "Quân của bạn",
    computerTook: "Quân của máy",
    moves: "Nước đi",
    noMoves: "Chưa có nước đi.",
    howToPlay: "Cách chơi",
    helpBullets: [
      "Chạm vào một giao điểm trống để đặt quân. X đi trước; hai bên luân phiên nhau.",
      "Nối được NĂM quân liên tiếp — ngang, dọc hoặc chéo — là thắng.",
      "Luật Việt Nam: đúng 5 quân mà bị chặn CẢ hai đầu thì KHÔNG thắng (biên bàn cũng tính là chặn). Từ 6 quân trở lên thì luôn thắng.",
      "Phòng thủ thắng ván cờ: chặn ngay hàng 4 hở của đối thủ và dè chừng đòn ba–ba.",
      "Bàn cờ đầy mà không ai nối được 5 thì hòa.",
    ],
    boardLabel: "Bàn cờ ca-rô",
    levelLabel: (n) => `Cấp ${n}`,
    levelDesc: [
      "Mới tập chơi", "Người mới", "Chơi vui", "Đang tiến bộ",
      "Câu lạc bộ", "Câu lạc bộ khá", "Chuyên gia",
      "Kiện tướng", "Đại kiện tướng", "Cực khó",
      "Ác mộng", "Bất khả chiến bại",
    ],
    setupCvc: "🤖 Máy đấu với máy",
    setupsTitle: "💾 Thế cờ đã lưu",
    setupsSave: "Lưu thế này",
    setupsNamePh: "Đặt tên cho thế cờ…",
    setupsLoad: "Nạp",
    setupsEmpty: "Chưa lưu thế cờ nào.",
    setupsUnnamed: "Thế cờ",
    setupsSaveFailed: "Không lưu được thế cờ.",
    cvcTitle: "Máy đấu với máy",
    cvcHint: "Hai máy cùng cấp độ tự đấu để giải thế cờ này.",
    cvcThinking: "Máy đang nghĩ…",
    cvcTurn: "Lượt đi",
    cvcPlay: "▶ Chạy tiếp",
    cvcPause: "⏸ Tạm dừng",
    cvcRestart: "↻ Chạy lại từ đầu",
    cvcBackToSetup: "↩ Về sắp xếp",
    cvcSpeed: "Tốc độ",
    cvcXWon: "🏆 X thắng!",
    cvcOWon: "🏆 O thắng!",
    cvcDrawn: "🤝 Hòa!",
    cvcReasonWin: "Thắng",
    cvcReasonDraw: "Hòa — đầy bàn",
    cvcReasonCap: "Bàn cờ đã đầy",
    winBadge: "BẠN THẮNG!",
    replaySiteCta: "👉 Chơi miễn phí tại cocaro.synerworlds.com",
    hint: "💡 Gợi ý",
    hintBusy: "💡 …",
    hintToast: (m) => `💡 Gợi ý: ${m}`,
    timeControl: "Giờ",
    noTimeControl: "Không",
    minutes: (n) => `${n} phút`,
    flagged: (c) => `${c} thua vì hết giờ!`,
    restoreToast: "↩️ Đã khôi phục ván đang chơi dở.",
    authLogin: "Đăng nhập",
    authSignup: "Đăng ký",
    authContinueWith: "Tiếp tục với",
    authOr: "hoặc",
    authDisplayName: "Tên hiển thị (tùy chọn)",
    authDisplayNamePh: "Tên của bạn trên bảng xếp hạng",
    authPassword: "Mật khẩu",
    authInvalid: "Nhập email hợp lệ và mật khẩu từ 6 ký tự.",
    authCheckEmail: "Đã tạo tài khoản! Kiểm tra email để xác nhận rồi đăng nhập.",
    authClose: "Đóng",
    authNoAccount: "Chưa có tài khoản?",
    authHaveAccount: "Đã có tài khoản?",
    stats: "Thống kê",
    statsTotalPlays: "Tổng lượt chơi",
    statsGuests: "Khách",
    statsFinished: "Chơi đến cùng",
    statsAbandoned: "bỏ cuộc",
    statsMembers: "Thành viên",
    statsNewMembers: "Thành viên mới",
    statsToday: "Hôm nay",
    statsThisWeek: "Tuần này",
    statsThisMonth: "Tháng này",
    statsByDay: "Ngày",
    statsByWeek: "Tuần",
    statsByMonth: "Tháng",
    statsByYear: "Năm",
    statsPlays: "Lượt chơi",
    statsLoading: "Đang tải…",
    statsNotConfigured: "Thống kê chưa khả dụng.",
    videoExport: "Xuất video",
    videoTitle: "Xuất video ván cờ",
    videoDesc: "Ghi lại toàn bộ ván cờ thành video clip có âm thanh để chia sẻ.",
    videoMoves: (n: number) => `Ván cờ có ${n} nước đi`,
    videoStart: "Bắt đầu ghi",
    videoRecording: "Đang ghi hình… giữ màn hình sáng.",
    videoCancel: "Hủy",
    videoShare: "Chia sẻ",
    videoDownload: "Tải xuống",
    videoClose: "Đóng",
    videoDone: "Xong! Video đã sẵn sàng.",
    videoError: "Không ghi được video trên thiết bị này.",
    videoSpeed: "Tốc độ",
    videoSpeedSlow: "Chậm",
    videoSpeedNormal: "Thường",
    videoSpeedFast: "Nhanh",
    videoMic: "🎤 Thu giọng bình luận",
    videoMicDenied: "Không truy cập được micro.",
    setupTitle: "Sắp xếp bàn cờ",
    setupPieces: "Quân cờ",
    setupMove: "Di chuyển",
    setupErase: "Xóa",
    setupHint: "Chọn X hoặc O rồi chạm vào các giao điểm để đặt quân. Với Di chuyển, chạm vào quân rồi chạm ô đích.",
    setupTurn: "Lượt đi đầu tiên",
    setupStart: "▶ Chơi thế cờ này",
    setupReset: "Đặt lại",
    setupClear: "Xóa sạch",
    setupErrEmpty: "Hãy đặt ít nhất hai quân lên bàn.",
    setupErrFinished: "Thế cờ này đã kết thúc. Hãy thay đổi để bên tới lượt có thể tiếp tục ván cờ.",
    setupErrNoMoves: "Bên tới lượt không có nước đi nào.",
    libTagline: "Hành trình tương tác: chiến thuật, bẫy, đột phá và tàn cuộc. Hoàn thành bài học để mở chương tiếp theo.",
    libProgress: (d, t) => `Đã hoàn thành ${d} / ${t} bài học`,
    libLessons: (d, t) => `${d} / ${t} bài học`,
    libUnlockHint: (prev) => `Hoàn thành “${prev}” để mở khóa`,
    libBack: "← Quay lại",
    libStep: (i, n) => `Bước ${i} / ${n}`,
    libDone: "Đã hoàn thành",
    libShowMove: "Xem nước đi ▶",
    libFindMove: "Hãy tìm nước đi!",
    libTryAgain: "Chưa đúng — thử lại nhé!",
    libExploreDone: "Đã khám phá xong",
    libCompleteLesson: "Hoàn thành bài học",
    libCelebration: "Hoàn thành bài học! Tiến độ của bạn đã được lưu.",
    libNextLesson: "Bài tiếp theo →",
    libBackToLibrary: "Về thư viện",
    /* Profile modal */
    profile: "Hồ sơ",
    profileFullName: "Họ tên",
    profileBirthDate: "Ngày sinh",
    profileCity: "Thành phố",
    profileCountry: "Quốc gia",
    profileAvatar: "Ảnh đại diện",
    profileChangeAvatar: "Đổi ảnh",
    profileUploading: "Đang tải ảnh…",
    profileUsername: "Tên trên bảng xếp hạng",
    profileEmail: "Email",
    profileSave: "Lưu",
    profileSaved: "Đã lưu hồ sơ ✓",
    achProfileTitle: "Thành tích Cờ Ca-rô của tôi",
    achShare: "📤 Khoe",
    shareDone: "Đã chia sẻ! 🎉",
    shareDownloaded: "Đã tải ảnh + chép link 📋",
    leaderboard: "Bảng xếp hạng",
    leaderboardLogin: "Đăng nhập để xem bảng xếp hạng.",
    peakRating: "cao nhất",
    dayStreak: "ngày liên tiếp",
    guestTeaserGames: (n: number) => `Bạn đã chơi ${n} ván với tư cách khách`,
    guestTeaserPuzzles: (n: number) => `giải ${n} thế cờ với tư cách khách`,
    guestTeaserCta: "Đăng nhập miễn phí để lưu tiến trình và chơi cùng bạn bè!",
    leaderboardEmpty: "Chưa có người chơi — hãy là người đầu tiên!",
    topPlayers: "Người chơi hàng đầu",
    noName: "Không tên",
    you: "bạn",
    wins: "thắng",
    losses: "thua",
    draws: "hòa",
    ratingProgress: "Tiến trình rating",
    winRate: "tỉ lệ thắng",
    gamesPlayed: "ván",
    loading: "Đang tải…",
    achRankTitle: (rank) => `🏆 Hạng #${rank} bảng xếp hạng!`,
    xpToNext: (xp, lvl) => `Còn ${xp} XP lên Cấp ${lvl}`,
    ambStats: (invites: number, xp: number) =>
      `🎁 Đại sứ: đã mời ${invites} người · +${xp} XP đã nhận`,
    referralTitle: "🎁 Mời bạn bè",
    referralDesc:
      "Gửi link cho bạn bè — khi họ đăng nhập và chơi 1 ván, cả hai cùng nhận +20 XP!",
    referralCopy: "Chép link mời",
    referralCopied: "Đã chép link mời! 📋",
    referralShare: "Chia sẻ",
    changePassword: "Đổi mật khẩu",
    newPassword: "Mật khẩu mới",
    confirmPassword: "Nhập lại mật khẩu mới",
    passwordChanged: "Đã đổi mật khẩu ✓",
    passwordMismatch: "Mật khẩu nhập lại không khớp",
    passwordTooShort: "Mật khẩu phải có ít nhất 6 ký tự",
    friendsTitle: "👤 Bạn bè",
    friendsChallengeIncoming: "⚔️ Lời thách đấu",
    friendsChallengeFrom: (name: string) => `⚔️ ${name} thách đấu bạn!`,
    friendsAccept: "Vào đấu",
    friendsDecline: "Từ chối",
    friendsEmpty: "Chưa có bạn bè. Kết bạn từ bảng xếp hạng hoặc trong phòng chơi nhé!",
    friendsOnline: "đang online",
    friendsInMatch: "đang đấu",
    friendsWatch: "👁 Xem",
    friendsChallengeBtn: "⚔️ Thách đấu",
    friendsUnfriend: "Xóa",
    friendsLoading: "Đang tải…",
    friendsSignIn: "Đăng nhập để kết bạn.",
    friendsActionError: "Đã xảy ra lỗi. Vui lòng thử lại.",
    hubChallengeTitle: (name) => `Thách đấu ${name}?`,
    hubChallengeSend: "⚔️ Thách đấu",
    hubChallengeLater: "Để sau",
    hubChallengeError: "Không gửi được lời thách đấu. Vui lòng thử lại.",
    hubChallengeNotFound: "Không tìm thấy người chơi này.",
    ssoError:
      "Không đăng nhập được bằng liên kết từ SynerWorlds — vui lòng đăng nhập thủ công.",
    recordFailed:
      "⚠️ Không ghi được kết quả lên máy chủ — trận này chưa được tính vào Thống kê.",
    sessionExpired:
      "Phiên đăng nhập đã hết hạn — hãy đăng nhập lại để tiếp tục ghi kết quả.",
    roomPromote: "Quảng bá",
    roomPromoMembers: (n) => `Phòng có ${n} thành viên`,
    roomPromoFooter: "👉 Thách đấu ngay tại cocaro.synerworlds.com",
    roomPromoCodeLabel: "Mã phòng",
    library: "Bí Kíp",
    step: "Bước",
    tryAgain: "Chưa đúng — thử lại nhé!",
    correct: "Chính xác! 🎉",
    back: "Quay lại",
    nextLesson: "Bài tiếp theo",
    backToLibrary: "Về thư viện",
    puzzlePrompt: "Tìm nước thắng cho",
    puzzleSolved: "Giải đố thành công! Tuyệt vời!",
    share: "Chia sẻ",
    puzzleRush: "Đố Nhanh",
    puzzleFailed: "Nước đó chưa thắng. Quan sát kỹ rồi thử lại nhé!",
    puzzleAlreadySolved: "Bạn đã giải đố hôm nay rồi.",
    rushOver: "Hết giờ!",
    score: "Điểm",
    best: "Kỷ lục",
    playAgain: "Chơi lại",
    gameName: "Cờ Ca-rô",
    playNow: "Chơi ngay — miễn phí, không cần cài!",
    youWin: "Bạn thắng! 🏆",
    youLose: "Bạn thua",
    draw: "Hòa",
  },
};

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem("caro-lang");
    if (saved === "vi" || saved === "en") return saved;
  } catch {
    /* storage unavailable */
  }
  if (
    typeof navigator !== "undefined" &&
    navigator.language?.toLowerCase().startsWith("vi")
  ) {
    return "vi";
  }
  return "en";
}
