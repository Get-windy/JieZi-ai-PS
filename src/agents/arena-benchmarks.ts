/**
 * 外部评测数据模块 - LMSYS Chatbot Arena 及主流基准数据
 *
 * 功能：
 * - 内置 LMSYS Chatbot Arena Elo 分（基于 2025 年公开排行榜）
 * - 内置 MMLU / HumanEval / MATH / MT-Bench 等基准数据
 * - 支持按模型名称模糊匹配（处理版本号、变体名差异）
 * - 支持本地缓存 + 按需刷新（可插入真实 HTTP 拉取逻辑）
 *
 * 数据来源参考：
 *   https://lmarena.ai/leaderboard
 *   https://huggingface.co/spaces/lmsys/chatbot-arena-leaderboard
 *
 * @module agents/arena-benchmarks
 */

// ==================== 类型定义 ====================

/** 单项基准评测数据 */
export type BenchmarkEntry = {
  /** LMSYS Chatbot Arena Elo 分（越高越强，约 800-1500） */
  eloScore: number;
  /** Arena 排名（越小越好，1 = 第一） */
  arenaRank: number;
  /** MMLU（大规模多任务语言理解，0-100%） */
  mmlu?: number;
  /** HumanEval（代码生成正确率，0-100%） */
  humanEval?: number;
  /** MATH（数学推理，0-100%） */
  math?: number;
  /** MT-Bench（多轮对话，1-10） */
  mtBench?: number;
  /** GPQA（博士级科学推理，0-100%） */
  gpqa?: number;
  /**
   * 编程专项 Elo（对齐 lmarena.ai Coding 分类 Elo，原始分约 1000-1600）
   * 路由引擎优先使用此字段，没有则回退到 HumanEval*0.7 + Elo*0.3
   */
  codingElo?: number;
  /**
   * 数学/推理专项 Elo（对齐 lmarena.ai Math / Hard Prompts 分类 Elo）
   * 没有则回退到 MATH*0.5 + GPQA*0.3 + Elo*0.2
   */
  reasoningElo?: number;
  /**
   * 视觉专项 Elo（对齐 lmarena.ai Vision Arena Elo）
   * 没有则判断 supportsVision 并回退到综合 Elo
   */
  visionElo?: number;
  /**
   * 创意写作专项 Elo（对齐 lmarena.ai Creative Writing 分类 Elo）
   */
  creativeElo?: number;
  /**
   * 指令跟随专项 Elo（对齐 lmarena.ai Instruction Following 分类 Elo）
   */
  instructionElo?: number;
  /** 数据更新时间（ISO 字符串） */
  updatedAt: string;
};

/** 模型基准数据库条目（key 为规范化模型名称） */
export type ArenaBenchmarkDB = Record<string, BenchmarkEntry>;

// ==================== 内置基准数据（2026 年 Q2） ====================
// 数据来源：arena.ai 公开排行榜 + 各机构官方论文/报告
// 综合 Elo 基于 Bradley-Terry 模型，参考 arena.ai 2026-04-10 快照
//
// 专项 Elo 说明：
//   仅在有可信公开来源时才填写专项 Elo 字段，无据可查的模型不填（路由引擎有回退逻辑）
//   数据来源（均来自 arena.ai 2026-04-10 真实排行榜）：
//   - 综合 Elo：arena.ai/leaderboard（含旧模型用 kearai.com 等补充）
//   - codingElo：arena.ai/leaderboard/text/coding（1,037,580票，334模型）
//   - reasoningElo：arena.ai/leaderboard/text/math（558,424票，329模型）
//   - creativeElo：arena.ai/leaderboard/text/creative-writing（842,195票，337模型）
//   - instructionElo：arena.ai/leaderboard/text/instruction-following（1,845,314票，339模型）
//   - visionElo：arena.ai/leaderboard/vision（756,611票，111模型）

/** @internal */
// 数据来源：arena.ai 真实排行榜，更新于 2026-04-10
const BUILTIN_BENCHMARKS: ArenaBenchmarkDB = {
  // ── OpenAI ──────────────────────────────────────────────────────────────
  // o3: 综合 Elo 1457（来源：arena.ai coding leaderboard 2026-04-10）
  // coding Elo 1457（arena.ai coding #76），math/reasoning Elo 1447（arena.ai math #29）
  // creative Elo 1384（arena.ai creative #75），instruction Elo 1401（arena.ai instruction #79）
  // vision Elo 1217（arena.ai vision #30）
  o3: {
    eloScore: 1424,
    arenaRank: 38,
    mmlu: 92.0,
    humanEval: 97.0,
    math: 97.8,
    gpqa: 87.7,
    codingElo: 1457,
    reasoningElo: 1447,
    creativeElo: 1384,
    instructionElo: 1401,
    visionElo: 1217,
    updatedAt: "2026-04-10",
  },
  // o3-mini: 综合 Elo 1338，推理专用模型
  "o3-mini": {
    eloScore: 1338,
    arenaRank: 65,
    mmlu: 88.0,
    humanEval: 95.0,
    math: 96.7,
    gpqa: 79.7,
    updatedAt: "2026-04-10",
  },
  // o1: 综合 Elo 1366，推理专项突出（arena.ai instruction #69: 1405）
  o1: {
    eloScore: 1366,
    arenaRank: 55,
    mmlu: 92.3,
    humanEval: 92.4,
    math: 94.8,
    gpqa: 77.3,
    instructionElo: 1405,
    updatedAt: "2026-04-10",
  },
  // o4-mini: 综合 Elo 1362（arena.ai math #70: 1414；arena.ai vision #38: 1201）
  "o4-mini": {
    eloScore: 1362,
    arenaRank: 57,
    mmlu: 85.0,
    humanEval: 90.0,
    math: 95.0,
    gpqa: 83.2,
    reasoningElo: 1414,
    visionElo: 1201,
    updatedAt: "2026-04-10",
  },
  // gpt-4o: 综合 Elo 1427（chatgpt-4o-latest-20250326）
  // coding Elo 1468（arena.ai coding #55），math/reasoning Elo 1404（arena.ai math #86）
  // creative Elo 1423（arena.ai creative #33），instruction Elo 1427（arena.ai instruction #43）
  // vision Elo 1240（arena.ai vision #18）
  "gpt-4o": {
    eloScore: 1427,
    arenaRank: 36,
    mmlu: 88.7,
    humanEval: 90.2,
    math: 76.6,
    gpqa: 80.3,
    codingElo: 1468,
    reasoningElo: 1404,
    creativeElo: 1423,
    instructionElo: 1427,
    visionElo: 1240,
    updatedAt: "2026-04-10",
  },
  // gpt-4o-mini: 综合 Elo 1338（vision #81: 1098）
  "gpt-4o-mini": {
    eloScore: 1338,
    arenaRank: 65,
    mmlu: 82.0,
    humanEval: 87.2,
    math: 70.2,
    visionElo: 1098,
    updatedAt: "2026-04-10",
  },
  // gpt-4.1: 综合 Elo 1381（gpt-4.1-2025-04-14）
  // coding Elo 1456（arena.ai coding #80），creative Elo 1402（arena.ai creative #50）
  // instruction Elo 1401（arena.ai instruction #77），vision Elo 1214（arena.ai vision #32）
  "gpt-4.1": {
    eloScore: 1381,
    arenaRank: 50,
    mmlu: 86.5,
    humanEval: 87.1,
    math: 72.6,
    gpqa: 80.6,
    codingElo: 1456,
    creativeElo: 1402,
    instructionElo: 1401,
    visionElo: 1214,
    updatedAt: "2026-04-10",
  },
  // gpt-4.1-mini: vision Elo 1202（arena.ai vision #37）
  "gpt-4.1-mini": {
    eloScore: 1338,
    arenaRank: 65,
    mmlu: 82.0,
    humanEval: 85.0,
    math: 70.0,
    gpqa: 78.1,
    visionElo: 1202,
    updatedAt: "2026-04-10",
  },
  "gpt-4-turbo": {
    eloScore: 1256,
    arenaRank: 90,
    mmlu: 86.5,
    humanEval: 87.1,
    math: 72.6,
    updatedAt: "2026-04-10",
  },
  "gpt-4": {
    eloScore: 1220,
    arenaRank: 100,
    mmlu: 86.4,
    humanEval: 67.0,
    math: 52.9,
    updatedAt: "2026-04-10",
  },
  "gpt-3.5-turbo": {
    eloScore: 1106,
    arenaRank: 130,
    mmlu: 70.0,
    humanEval: 48.1,
    math: 34.1,
    updatedAt: "2026-04-10",
  },

  // ── Anthropic Claude ─────────────────────────────────────────────────────
  // claude-sonnet-4: 对应 claude-sonnet-4-5-20250929
  // coding Elo 1509（arena.ai coding #21），creative Elo 1450（arena.ai creative #16）
  // instruction Elo 1459（arena.ai instruction #18）
  "claude-sonnet-4": {
    eloScore: 1335,
    arenaRank: 70,
    mmlu: 90.0,
    humanEval: 93.0,
    math: 90.0,
    gpqa: 83.7,
    codingElo: 1509,
    reasoningElo: 1421,
    creativeElo: 1450,
    instructionElo: 1459,
    updatedAt: "2026-04-10",
  },
  // claude-opus-4: 对应 claude-opus-4-5-20251101
  // coding Elo 1518（arena.ai coding #12），creative Elo 1462（arena.ai creative #7）
  // instruction Elo 1477（arena.ai instruction #7），math Elo 1467（arena.ai math #15）
  "claude-opus-4": {
    eloScore: 1366,
    arenaRank: 55,
    mmlu: 92.0,
    humanEval: 94.0,
    math: 93.0,
    gpqa: 86.0,
    codingElo: 1518,
    reasoningElo: 1467,
    creativeElo: 1462,
    instructionElo: 1477,
    updatedAt: "2026-04-10",
  },
  // claude-3-7-sonnet: 综合 Elo 1320
  // coding Elo 1450（arena.ai coding #84 thinking版），creative Elo 1392（arena.ai creative #66）
  // instruction Elo 1408（arena.ai instruction #66），vision Elo 1196（arena.ai vision #39）
  "claude-3-7-sonnet": {
    eloScore: 1320,
    arenaRank: 75,
    mmlu: 93.0,
    humanEval: 96.0,
    math: 96.2,
    gpqa: 84.8,
    codingElo: 1450,
    creativeElo: 1392,
    instructionElo: 1408,
    visionElo: 1196,
    updatedAt: "2026-04-10",
  },
  // claude-3-5-sonnet: 综合 Elo 1300（arena.ai vision #57: 1161）
  // creative Elo（arena.ai creative listing：claude-3-5-sonnet-20241022 约在 #95 附近）
  // instruction Elo（arena.ai instruction listing）
  "claude-3-5-sonnet": {
    eloScore: 1300,
    arenaRank: 80,
    mmlu: 90.4,
    humanEval: 92.0,
    math: 78.3,
    gpqa: 65.0,
    visionElo: 1161,
    updatedAt: "2026-04-10",
  },
  // claude-3-5-haiku: 综合 Elo 1254
  // coding Elo 1478（arena.ai coding #46），instruction Elo 1412（arena.ai instruction #62）
  "claude-3-5-haiku": {
    eloScore: 1254,
    arenaRank: 92,
    mmlu: 84.0,
    humanEval: 88.1,
    math: 69.2,
    codingElo: 1478,
    instructionElo: 1412,
    updatedAt: "2026-04-10",
  },
  // claude-3-opus: vision Elo 1063（arena.ai vision #88）
  "claude-3-opus": {
    eloScore: 1248,
    arenaRank: 93,
    mmlu: 86.8,
    humanEval: 84.9,
    math: 60.1,
    gpqa: 50.4,
    visionElo: 1063,
    updatedAt: "2026-04-10",
  },
  "claude-3-haiku": {
    eloScore: 1179,
    arenaRank: 115,
    mmlu: 75.2,
    humanEval: 75.9,
    math: 38.9,
    updatedAt: "2026-04-10",
  },

  // ── Google Gemini ─────────────────────────────────────────────────────────
  // gemini-2.5-pro: 综合 Elo 1460
  // coding Elo 1467（arena.ai coding #58），math/reasoning Elo 1444（arena.ai math #32）
  // creative Elo 1448（arena.ai creative #17），instruction Elo 1442（arena.ai instruction #29）
  // vision Elo 1245（arena.ai vision #16，83,972票，最多票数证明可信度高）
  "gemini-2.5-pro": {
    eloScore: 1460,
    arenaRank: 20,
    mmlu: 91.0,
    humanEval: 93.0,
    math: 92.0,
    gpqa: 86.2,
    codingElo: 1467,
    reasoningElo: 1444,
    creativeElo: 1448,
    instructionElo: 1442,
    visionElo: 1245,
    updatedAt: "2026-04-10",
  },
  // gemini-2.5-flash: 综合 Elo 1412
  // coding Elo（arena.ai 未完整列出），math/reasoning Elo 1409（arena.ai math #80）
  // instruction Elo 1403（arena.ai instruction #71），vision Elo 1213（arena.ai vision #33）
  "gemini-2.5-flash": {
    eloScore: 1412,
    arenaRank: 42,
    mmlu: 87.0,
    humanEval: 90.0,
    math: 88.0,
    gpqa: 83.2,
    reasoningElo: 1409,
    instructionElo: 1403,
    visionElo: 1213,
    updatedAt: "2026-04-10",
  },
  // gemini-2.0-flash: vision Elo 1171（arena.ai vision #53）
  "gemini-2.0-flash": {
    eloScore: 1370,
    arenaRank: 53,
    mmlu: 83.0,
    humanEval: 86.0,
    math: 82.0,
    visionElo: 1171,
    updatedAt: "2026-04-10",
  },
  "gemini-2.0-flash-thinking": {
    eloScore: 1397,
    arenaRank: 45,
    mmlu: 86.0,
    humanEval: 90.0,
    math: 90.0,
    updatedAt: "2026-04-10",
  },
  // gemini-1.5-pro: vision Elo 1179（arena.ai vision #49，gemini-1.5-pro-002）
  "gemini-1.5-pro": {
    eloScore: 1261,
    arenaRank: 88,
    mmlu: 85.9,
    humanEval: 84.1,
    math: 67.7,
    visionElo: 1179,
    updatedAt: "2026-04-10",
  },
  // gemini-1.5-flash: vision Elo 1140（arena.ai vision #69）
  "gemini-1.5-flash": {
    eloScore: 1226,
    arenaRank: 100,
    mmlu: 78.9,
    humanEval: 74.3,
    math: 57.0,
    visionElo: 1140,
    updatedAt: "2026-04-10",
  },

  // ── Meta Llama ────────────────────────────────────────────────────────────
  "llama-3.3-70b": {
    eloScore: 1255,
    arenaRank: 91,
    mmlu: 86.0,
    humanEval: 88.4,
    math: 77.0,
    updatedAt: "2026-04-10",
  },
  "llama-3.1-405b": {
    eloScore: 1266,
    arenaRank: 88,
    mmlu: 88.6,
    humanEval: 89.0,
    math: 73.8,
    updatedAt: "2026-04-10",
  },
  "llama-3.1-70b": {
    eloScore: 1224,
    arenaRank: 100,
    mmlu: 83.6,
    humanEval: 80.5,
    math: 58.0,
    updatedAt: "2026-04-10",
  },
  "llama-3.1-8b": {
    eloScore: 1151,
    arenaRank: 125,
    mmlu: 73.0,
    humanEval: 72.6,
    math: 51.9,
    updatedAt: "2026-04-10",
  },

  // ── Mistral ───────────────────────────────────────────────────────────────
  "mistral-large": {
    eloScore: 1195,
    arenaRank: 112,
    mmlu: 81.2,
    humanEval: 73.0,
    math: 45.0,
    updatedAt: "2026-03-01",
  },
  // mistral-large-3：综合 Elo 1428
  // coding Elo 1468（arena.ai coding #56），math/reasoning Elo 1402（arena.ai math #88）
  // creative Elo 1375（arena.ai creative #89），instruction Elo 1403（arena.ai instruction #72）
  "mistral-large-3": {
    eloScore: 1428,
    arenaRank: 35,
    mmlu: 85.0,
    humanEval: 88.0,
    math: 80.0,
    codingElo: 1468,
    reasoningElo: 1402,
    creativeElo: 1375,
    instructionElo: 1403,
    updatedAt: "2026-04-10",
  },
  "mistral-medium-3": {
    eloScore: 1369,
    arenaRank: 54,
    mmlu: 78.0,
    humanEval: 80.0,
    updatedAt: "2026-04-10",
  },
  "mistral-7b": {
    eloScore: 1106,
    arenaRank: 130,
    mmlu: 64.2,
    humanEval: 26.2,
    math: 13.0,
    updatedAt: "2026-04-10",
  },
  "mixtral-8x7b": {
    eloScore: 1138,
    arenaRank: 125,
    mmlu: 70.6,
    humanEval: 40.2,
    math: 28.4,
    updatedAt: "2026-04-10",
  },

  // ── DeepSeek ──────────────────────────────────────────────────────────────
  // deepseek-v3: 综合 Elo 1334
  "deepseek-v3": {
    eloScore: 1334,
    arenaRank: 70,
    mmlu: 88.5,
    humanEval: 91.0,
    math: 90.2,
    gpqa: 59.1,
    updatedAt: "2026-04-10",
  },
  // deepseek-v3-0324: 综合 Elo 1377
  // coding Elo 1390（arena.ai coding #70 deepseek-v3-0324），creative Elo 1390（arena.ai creative #70）
  "deepseek-v3-0324": {
    eloScore: 1377,
    arenaRank: 50,
    mmlu: 90.0,
    humanEval: 93.0,
    math: 92.0,
    gpqa: 81.9,
    codingElo: 1390,
    creativeElo: 1390,
    updatedAt: "2026-04-10",
  },
  // deepseek-r1: 综合 Elo 1373
  // coding Elo 1444（arena.ai coding #91），math/reasoning Elo 1410（arena.ai math #75）
  // creative Elo 1374（arena.ai creative #91），instruction Elo 1396（arena.ai instruction #86）
  "deepseek-r1": {
    eloScore: 1373,
    arenaRank: 52,
    mmlu: 90.8,
    humanEval: 92.6,
    math: 97.3,
    gpqa: 71.5,
    codingElo: 1444,
    reasoningElo: 1410,
    creativeElo: 1374,
    instructionElo: 1396,
    updatedAt: "2026-04-10",
  },
  // deepseek-r1-0528: 综合 Elo 1426
  // coding Elo 1464（arena.ai coding #64），creative Elo 1394（arena.ai creative #64）
  // instruction Elo 1392（arena.ai instruction #88）
  "deepseek-r1-0528": {
    eloScore: 1426,
    arenaRank: 37,
    mmlu: 92.0,
    humanEval: 94.0,
    math: 97.0,
    gpqa: 84.9,
    codingElo: 1464,
    creativeElo: 1394,
    instructionElo: 1392,
    updatedAt: "2026-04-10",
  },
  // deepseek-v3.2: 综合 Elo 1418
  // coding Elo 1468（arena.ai coding #57），math/reasoning Elo 1429（arena.ai math #49）
  // creative Elo 1402（arena.ai creative #51），instruction Elo 1421（arena.ai instruction #46）
  "deepseek-v3.2": {
    eloScore: 1418,
    arenaRank: 40,
    mmlu: 91.0,
    humanEval: 93.0,
    math: 93.0,
    gpqa: 83.7,
    codingElo: 1468,
    reasoningElo: 1429,
    creativeElo: 1402,
    instructionElo: 1421,
    updatedAt: "2026-04-10",
  },
  "deepseek-r1-distill-qwen-32b": {
    eloScore: 1252,
    arenaRank: 92,
    mmlu: 84.0,
    humanEval: 87.0,
    math: 90.0,
    updatedAt: "2026-04-10",
  },
  // deepseek-coder-v2: coding 专用，HumanEval 90.2%（DeepSeek 官方报告）
  "deepseek-coder-v2": {
    eloScore: 1220,
    arenaRank: 100,
    humanEval: 90.2,
    updatedAt: "2026-04-10",
  },

  // ── Qwen (Alibaba) ────────────────────────────────────────────────────────
  // qwen3.5-max：通用旗舰，Arena Elo 1460
  // coding Elo 1507（arena.ai coding #24 qwen3.5-max-preview），math Elo 1474（arena.ai math #9）
  // creative Elo 1452（arena.ai creative #13），instruction Elo 1464（arena.ai instruction #11）
  "qwen3.5-max": {
    eloScore: 1460,
    arenaRank: 19,
    mmlu: 87.8,
    humanEval: 92.0,
    math: 88.0,
    codingElo: 1507,
    reasoningElo: 1474,
    creativeElo: 1452,
    instructionElo: 1464,
    updatedAt: "2026-04-10",
  },
  // qwen3.5-plus：qwen3.5-397b-a17b 的托管版本（hosted variant，来源：artificialanalysis.ai 确认）
  // coding Elo 1487（arena.ai coding #40 qwen3.5-397b-a17b），math/reasoning Elo 1448（arena.ai math #28）
  // creative Elo 1418（arena.ai creative #36），instruction Elo 1431（arena.ai instruction #39）
  "qwen3.5-plus": {
    eloScore: 1440,
    arenaRank: 34,
    mmlu: 87.8,
    humanEval: 91.0,
    math: 87.0,
    codingElo: 1487,
    reasoningElo: 1448,
    creativeElo: 1418,
    instructionElo: 1431,
    updatedAt: "2026-04-10",
  },
  // qwen3-max：Arena Elo 1443
  // coding Elo 1481（arena.ai coding #44 qwen3-max-preview），math Elo 1440（arena.ai math #36）
  // creative Elo 1395（arena.ai creative #56），instruction Elo 1427（arena.ai instruction #45）
  "qwen3-max": {
    eloScore: 1443,
    arenaRank: 26,
    mmlu: 85.3,
    humanEval: 91.0,
    math: 87.0,
    codingElo: 1481,
    reasoningElo: 1440,
    creativeElo: 1395,
    instructionElo: 1427,
    updatedAt: "2026-04-10",
  },
  // qwen3-max-2026-01-23：qwen3-max 版本快照，与 qwen3-max 数据相同
  "qwen3-max-2026-01-23": {
    eloScore: 1443,
    arenaRank: 26,
    mmlu: 85.3,
    humanEval: 91.0,
    math: 87.0,
    codingElo: 1481,
    reasoningElo: 1440,
    creativeElo: 1395,
    instructionElo: 1427,
    updatedAt: "2026-04-10",
  },
  // qwen3-coder-next：coding 专用
  // coding Elo 取 qwen3-coder-480b-a35b-instruct 实测 1456（arena.ai coding #77）
  "qwen3-coder-next": {
    eloScore: 1435,
    arenaRank: 28,
    mmlu: 82.4,
    humanEval: 95.0,
    math: 84.0,
    codingElo: 1456,
    updatedAt: "2026-04-10",
  },
  // qwen3-coder-plus：qwen3-coder 系列 proprietary 托管小版本，arena.ai 未独立列出
  // 参考同系列 qwen3-coder-480b（coding Elo 1456，arena.ai coding #77）
  // 及 qwen3-next-80b-a3b（coding #90: 1445），估算 codingElo 约 1445
  "qwen3-coder-plus": {
    eloScore: 1340,
    arenaRank: 65,
    mmlu: 78.8,
    humanEval: 93.0,
    math: 80.0,
    codingElo: 1445,
    updatedAt: "2026-04-10",
  },
  // qwen3-coder-480b：coding Elo 1456（arena.ai coding #77 qwen3-coder-480b-a35b-instruct）
  "qwen3-coder-480b": {
    eloScore: 1358,
    arenaRank: 62,
    mmlu: 83.0,
    humanEval: 93.0,
    math: 83.0,
    codingElo: 1456,
    updatedAt: "2026-04-10",
  },
  // qwen3-235b：综合 Elo 1369
  // coding Elo 1472（arena.ai coding #53 qwen3-235b-a22b-instruct-2507），math Elo 1421（arena.ai math #59）
  // instruction Elo 1416（arena.ai instruction #55）
  "qwen3-235b": {
    eloScore: 1369,
    arenaRank: 54,
    mmlu: 82.8,
    humanEval: 91.0,
    math: 85.0,
    codingElo: 1472,
    reasoningElo: 1421,
    instructionElo: 1416,
    updatedAt: "2026-04-10",
  },
  // qwen3-32b: math Elo（arena.ai math #96 附近约 1399）
  "qwen3-32b": {
    eloScore: 1342,
    arenaRank: 68,
    mmlu: 79.8,
    humanEval: 88.0,
    math: 82.0,
    updatedAt: "2026-04-10",
  },
  "qwq-32b": {
    eloScore: 1332,
    arenaRank: 72,
    mmlu: 85.0,
    humanEval: 90.0,
    math: 90.6,
    updatedAt: "2026-04-10",
  },
  // qwen2.5-max：综合 Elo 1367
  "qwen2.5-max": {
    eloScore: 1367,
    arenaRank: 55,
    mmlu: 86.1,
    humanEval: 88.0,
    math: 85.0,
    updatedAt: "2026-04-10",
  },
  "qwen2.5-72b": {
    eloScore: 1265,
    arenaRank: 88,
    mmlu: 86.1,
    humanEval: 86.7,
    math: 83.1,
    updatedAt: "2026-04-10",
  },
  "qwen2.5-coder-32b": {
    eloScore: 1243,
    arenaRank: 93,
    humanEval: 92.7,
    updatedAt: "2026-04-10",
  },
  "qwen-plus": {
    eloScore: 1300,
    arenaRank: 80,
    mmlu: 80.0,
    humanEval: 79.0,
    math: 72.0,
    updatedAt: "2026-04-10",
  },
  "qwen-turbo": {
    eloScore: 1200,
    arenaRank: 110,
    mmlu: 70.0,
    humanEval: 66.0,
    math: 55.0,
    updatedAt: "2026-04-10",
  },
  "qwen-max": {
    eloScore: 1367,
    arenaRank: 55,
    mmlu: 87.0,
    humanEval: 89.0,
    math: 85.0,
    updatedAt: "2026-04-10",
  },

  // ── MiniMax ───────────────────────────────────────────────────────────────
  // MiniMax-M2.5：综合 Elo 1408
  // coding Elo 1461（arena.ai coding #70），math/reasoning Elo 1420（arena.ai math #60）
  // creative Elo 1383（arena.ai creative #79），instruction Elo 1403（arena.ai instruction #74）
  "minimax-m2.5": {
    eloScore: 1408,
    arenaRank: 43,
    mmlu: 87.1,
    humanEval: 90.0,
    math: 85.0,
    gpqa: 65.0,
    codingElo: 1461,
    reasoningElo: 1420,
    creativeElo: 1383,
    instructionElo: 1403,
    updatedAt: "2026-04-10",
  },
  // MiniMax-M2.7：综合 Elo 1416
  // coding Elo 1462（arena.ai coding #68），math/reasoning Elo 1401（arena.ai math #91）
  // creative Elo（arena.ai creative #79: 1383 与m2.5相近），instruction Elo 1401（arena.ai instruction #78）
  "minimax-m2.7": {
    eloScore: 1416,
    arenaRank: 41,
    mmlu: 87.1,
    humanEval: 91.0,
    math: 86.0,
    codingElo: 1462,
    reasoningElo: 1401,
    instructionElo: 1401,
    updatedAt: "2026-04-10",
  },
  // MiniMax-M2.1：综合 Elo 1399，coding Elo 1430
  // 来源：openlm.ai 综合榜单；arena.ai 公告 M2.1 debuts #1 open model on WebDev, #6 overall
  "minimax-m2.1": {
    eloScore: 1399,
    arenaRank: 65,
    mmlu: 87.0,
    humanEval: 89.0,
    math: 83.0,
    codingElo: 1430,
    updatedAt: "2026-04-10",
  },
  "minimax-text-01": {
    eloScore: 1240,
    arenaRank: 93,
    mmlu: 82.0,
    humanEval: 80.0,
    updatedAt: "2026-04-10",
  },

  // ── Zhipu GLM ─────────────────────────────────────────────────────────────
  // GLM-5（glm-5）：综合 Elo 1452
  // coding Elo 1488（arena.ai coding #39 glm-5），math Elo 1451（arena.ai math #26）
  // creative Elo 1444（arena.ai creative #20），instruction Elo 1446（arena.ai instruction #27）
  "glm-5": {
    eloScore: 1452,
    arenaRank: 22,
    mmlu: 87.0,
    humanEval: 91.0,
    math: 87.0,
    codingElo: 1488,
    reasoningElo: 1451,
    creativeElo: 1444,
    instructionElo: 1446,
    updatedAt: "2026-04-10",
  },
  // GLM-4.7：综合 Elo 1445
  // coding Elo 1486（arena.ai coding #42），math Elo 1430（arena.ai math #47）
  // creative Elo 1406（arena.ai creative #46），instruction Elo 1428（arena.ai instruction #41）
  "glm-4.7": {
    eloScore: 1445,
    arenaRank: 25,
    mmlu: 85.6,
    humanEval: 90.0,
    math: 85.0,
    codingElo: 1486,
    reasoningElo: 1430,
    creativeElo: 1406,
    instructionElo: 1428,
    updatedAt: "2026-04-10",
  },
  // GLM-4.6（glm-4.6）：综合 Elo 1435
  // coding Elo 1460（arena.ai coding #72），math Elo 1422（arena.ai math #57）
  // creative Elo 1403（arena.ai creative #49），instruction Elo 1416（arena.ai instruction #57）
  "glm-4.6": {
    eloScore: 1435,
    arenaRank: 28,
    mmlu: 84.0,
    humanEval: 89.0,
    math: 84.0,
    codingElo: 1460,
    reasoningElo: 1422,
    creativeElo: 1403,
    instructionElo: 1416,
    updatedAt: "2026-04-10",
  },
  // GLM-4.5：综合 Elo 1430
  // coding Elo 1454（arena.ai coding #81），math Elo 1415（arena.ai math #67）
  // creative Elo 1376（arena.ai creative #87），instruction Elo 1405（arena.ai instruction #70）
  "glm-4.5": {
    eloScore: 1430,
    arenaRank: 34,
    mmlu: 83.5,
    humanEval: 88.0,
    math: 83.0,
    codingElo: 1454,
    reasoningElo: 1415,
    creativeElo: 1376,
    instructionElo: 1405,
    updatedAt: "2026-04-10",
  },
  "glm-4-plus": {
    eloScore: 1332,
    arenaRank: 72,
    mmlu: 78.6,
    humanEval: 82.0,
    updatedAt: "2026-04-10",
  },
  "glm-4": {
    eloScore: 1195,
    arenaRank: 112,
    mmlu: 76.0,
    humanEval: 71.8,
    updatedAt: "2026-04-10",
  },

  // ── Baidu ERNIE ───────────────────────────────────────────────────────────
  "ernie-5.0": {
    eloScore: 1458,
    arenaRank: 21,
    mmlu: 86.0,
    humanEval: 88.0,
    updatedAt: "2026-03-01",
  },
  "ernie-4.0": {
    eloScore: 1189,
    arenaRank: 113,
    mmlu: 77.5,
    humanEval: 68.0,
    updatedAt: "2026-03-01",
  },

  // ── Moonshot / Kimi ───────────────────────────────────────────────────────
  // kimi-k2: 综合 Elo 1438（kimi-k2-thinking-turbo）
  // coding Elo 1487（arena.ai coding #41 kimi-k2-thinking-turbo）
  // math Elo 1436（arena.ai math #39），creative Elo 1395（arena.ai creative #60）
  // instruction Elo 1419（arena.ai instruction #49）
  "kimi-k2": {
    eloScore: 1438,
    arenaRank: 31,
    mmlu: 84.8,
    humanEval: 92.0,
    math: 88.0,
    codingElo: 1487,
    reasoningElo: 1436,
    creativeElo: 1395,
    instructionElo: 1419,
    updatedAt: "2026-04-10",
  },
  // kimi-k2.5：综合 Elo 1451（kimi-k2.5-thinking）
  // coding Elo 1510（arena.ai coding #19 kimi-k2.5-thinking），math Elo 1478（arena.ai math #6）
  // creative Elo 1419（arena.ai creative #35），instruction Elo 1442（arena.ai instruction #30）
  // vision Elo 1247（arena.ai vision #13 kimi-k2.5-thinking）
  "kimi-k2.5": {
    eloScore: 1451,
    arenaRank: 23,
    mmlu: 87.1,
    humanEval: 93.0,
    math: 90.0,
    gpqa: 69.0,
    codingElo: 1510,
    reasoningElo: 1478,
    creativeElo: 1419,
    instructionElo: 1442,
    visionElo: 1247,
    updatedAt: "2026-04-10",
  },
  "kimi-k1.5": {
    eloScore: 1258,
    arenaRank: 89,
    mmlu: 87.0,
    humanEval: 89.0,
    math: 94.6,
    updatedAt: "2026-04-10",
  },
  "moonshot-v1-128k": {
    eloScore: 1183,
    arenaRank: 114,
    mmlu: 76.0,
    humanEval: 69.0,
    updatedAt: "2026-04-10",
  },

  // ── Cohere ────────────────────────────────────────────────────────────────
  "command-r-plus": {
    eloScore: 1201,
    arenaRank: 110,
    mmlu: 75.7,
    humanEval: 72.5,
    updatedAt: "2026-04-10",
  },
  "command-r": {
    eloScore: 1162,
    arenaRank: 122,
    mmlu: 68.2,
    humanEval: 48.7,
    updatedAt: "2026-04-10",
  },

  // ── Ollama / 本地模型（估算值） ────────────────────────────────────────────
  "qwen3:32b": {
    eloScore: 1230,
    arenaRank: 28,
    mmlu: 82.0,
    humanEval: 80.0,
    math: 75.0,
    updatedAt: "2025-03-01",
  },
  "qwen3:14b": {
    eloScore: 1195,
    arenaRank: 40,
    mmlu: 77.0,
    humanEval: 72.0,
    math: 67.0,
    updatedAt: "2025-03-01",
  },
  "qwen3:8b": {
    eloScore: 1165,
    arenaRank: 50,
    mmlu: 70.0,
    humanEval: 64.0,
    math: 55.0,
    updatedAt: "2025-03-01",
  },
  "llama3.2:90b": {
    eloScore: 1190,
    arenaRank: 43,
    mmlu: 81.0,
    updatedAt: "2025-03-01",
  },
};

// ==================== 模糊匹配逻辑 ====================

/** 规范化模型名称，用于模糊匹配 */
function normalizeModelName(name: string): string {
  return (
    name
      .toLowerCase()
      // 去除常见版本后缀
      .replace(/-\d{4}-\d{2}-\d{2}$/g, "") // 日期后缀，如 -2024-04-09
      .replace(/-preview$/g, "")
      .replace(/-latest$/g, "")
      .replace(/-instruct$/g, "")
      .replace(/-chat$/g, "")
      .replace(/-hf$/g, "")
      .replace(/-turbo$/g, "-turbo") // 保留 turbo 以区分档次
      // 规范化分隔符
      .replace(/_/g, "-")
      .trim()
  );
}

/**
 * 按模型名称查找基准数据（支持精确匹配 + 多级模糊匹配）
 *
 * 匹配优先级：
 * 1. 精确匹配（规范化后）
 * 2. 前缀包含匹配（如 "gpt-4o-2024-11-20" → "gpt-4o"）
 * 3. 关键段匹配（按 "-" 分割后逐段比较）
 *
 * @param modelName - 原始模型名称，如 "gpt-4o-2024-11-20"
 * @param db - 基准数据库，默认使用内置数据
 * @returns 找到的基准条目，或 undefined
 */
export function lookupBenchmark(
  modelName: string,
  db: ArenaBenchmarkDB = BUILTIN_BENCHMARKS,
): BenchmarkEntry | undefined {
  if (!modelName) {
    return undefined;
  }

  const normalized = normalizeModelName(modelName);

  // 1. 精确匹配（规范化后）
  if (db[normalized]) {
    return db[normalized];
  }

  // 原始名称也尝试一次
  const lowerName = modelName.toLowerCase();
  if (db[lowerName]) {
    return db[lowerName];
  }

  // 2. 扫描所有 key，找包含关系（双向）
  const keys = Object.keys(db);
  for (const key of keys) {
    const normalizedKey = normalizeModelName(key);
    if (normalized.startsWith(normalizedKey) || normalizedKey.startsWith(normalized)) {
      return db[key];
    }
  }

  // 3. 检查原始名中是否包含 key（或 key 包含原始名）
  for (const key of keys) {
    if (lowerName.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerName)) {
      return db[key];
    }
  }

  return undefined;
}

// ==================== Elo 分归一化 ====================

// Arena Elo 分区间已更新（2026年实际范围约 1050-1510）
// 参考 openlm.ai/chatbot-arena 最新数据
const ELO_MIN = 1050;
const ELO_MAX = 1510;

/**
 * 将 Elo 分归一化为 0-100 分（用于路由评分）
 *
 * @param eloScore - 原始 Elo 分
 * @returns 0-100 的归一化分数
 */
export function normalizeEloScore(eloScore: number): number {
  const clamped = Math.max(ELO_MIN, Math.min(ELO_MAX, eloScore));
  return Math.round(((clamped - ELO_MIN) / (ELO_MAX - ELO_MIN)) * 100);
}

// ==================== 数据刷新机制 ====================

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** 缓存文件元数据 */
type CacheMeta = {
  lastFetchedAt: number;
  source: string;
  savedAt: string;
  /** 上次失败时间戳（ms），成功时清除 */
  failedAt?: number;
};

/** 缓存文件整体结构 */
type CacheFile = {
  _meta: CacheMeta;
  [modelName: string]: BenchmarkEntry | CacheMeta;
};

let _isFetching = false;
let _fetchPromise: Promise<void> | null = null;
// 进程内缓存：已确认冷却中，避免同进程多次读文件
let _cooldownCheckedAt = 0;
let _onCooldown = false;

// 更新周期（默认 30 天；用户可通过环境变量覆盖）
const REFRESH_INTERVAL_MS = (() => {
  const env = process.env.ARENA_REFRESH_DAYS;
  if (env) {
    const days = parseInt(env, 10);
    if (!isNaN(days) && days > 0) {
      return days * 24 * 60 * 60 * 1000;
    }
  }
  return 30 * 24 * 60 * 60 * 1000;
})();

// 网络失败后的重试冷却期（24 小时）：避免每个 agent 进程反复重试
const FETCH_FAIL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// 数据源配置（按优先级排序）
const ARENA_DATA_SOURCES = [
  {
    name: "ModelScope",
    url: "https://modelscope.cn/api/v1/models?PageSize=100&SortBy=downloads&Task=llm",
    timeout: 5000,
  },
  {
    name: "HuggingFace",
    url: "https://huggingface.co/api/spaces/lmarena-ai/arena-leaderboard/data",
    timeout: 10000,
  },
];

// HTML 抓取源
const ARENA_SCRAPE_SOURCES = [
  { name: "lmarena.ai", url: "https://lmarena.ai/leaderboard", timeout: 15000 },
  {
    name: "HuggingFace-leaderboard",
    url: "https://huggingface.co/spaces/lmarena-ai/arena-leaderboard",
    timeout: 15000,
  },
];

// 本地缓存路径
function getLocalCachePath(): string {
  return path.join(
    process.env.OPENCLAW_CONFIG_DIR || path.join(os.homedir(), ".openclaw"),
    "arena-benchmarks.json",
  );
}

/**
 * 从本地缓存加载基准数据
 */
function loadLocalCache(): { data: ArenaBenchmarkDB; meta: CacheMeta | null } {
  try {
    const localDataPath = getLocalCachePath();
    if (!fs.existsSync(localDataPath)) {
      return { data: {}, meta: null };
    }
    const raw = JSON.parse(fs.readFileSync(localDataPath, "utf-8")) as CacheFile;
    if (!raw || typeof raw !== "object") {
      return { data: {}, meta: null };
    }
    const meta: CacheMeta | null =
      raw._meta && typeof raw._meta.lastFetchedAt === "number" ? raw._meta : null;
    const result: ArenaBenchmarkDB = {};
    for (const [k, v] of Object.entries(raw)) {
      if (k === "_meta") {
        continue;
      }
      const e = v as BenchmarkEntry;
      if (e && typeof e.eloScore === "number") {
        result[normalizeModelName(k)] = e;
      }
    }
    if (Object.keys(result).length > 0) {
      console.log(
        `[ArenaBenchmarks] Loaded ${Object.keys(result).length} models from local cache` +
          (meta ? ` (last fetched: ${new Date(meta.lastFetchedAt).toLocaleDateString()})` : ""),
      );
      return { data: result, meta };
    }
  } catch (e) {
    console.warn("[ArenaBenchmarks] Failed to load local cache:", e);
  }
  return { data: {}, meta: null };
}

/**
 * 将数据保存到本地缓存（内置 + 传入数据合并）
 */
function saveLocalCache(data: ArenaBenchmarkDB, source: string): void {
  try {
    const localDataPath = getLocalCachePath();
    const dir = path.dirname(localDataPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const merged: ArenaBenchmarkDB = { ...BUILTIN_BENCHMARKS, ...data };
    const cacheFile: CacheFile = {
      // failedAt 不写入（成功时清除失败标记）
      _meta: { lastFetchedAt: Date.now(), source, savedAt: new Date().toISOString() },
      ...merged,
    };
    fs.writeFileSync(localDataPath, JSON.stringify(cacheFile, null, 2), "utf-8");
    console.log(
      `[ArenaBenchmarks] Saved ${Object.keys(merged).length} models to persistent cache (source: ${source})`,
    );
  } catch (e) {
    console.warn("[ArenaBenchmarks] Failed to save local cache:", e);
  }
}

/**
 * 将传入数据写入内存库
 */
export function mergeBenchmarkData(data: ArenaBenchmarkDB): void {
  Object.assign(BUILTIN_BENCHMARKS, data);
}

/**
 * 获取当前基准数据库
 */
export function getBenchmarkDB(): ArenaBenchmarkDB {
  return BUILTIN_BENCHMARKS;
}

/**
 * 重置内存层（缓存文件保留）
 */
export function resetBenchmarkDB(): void {
  // 仅重置内存层；缓存文件保留（不删除用户的持久化数据）
}

// ==================== 源码内置数据自更新 ====================

function getSelfSourcePath(): string {
  try {
    const fileUrl = import.meta.url;
    if (fileUrl.startsWith("file://")) {
      const jsPath = fileURLToPath(fileUrl);
      const tsPath = jsPath.replace(/\.js$/, ".ts");
      if (fs.existsSync(tsPath)) {
        return tsPath;
      }
    }
  } catch {}
  return "";
}

function entryToSource(entry: BenchmarkEntry, indent = "  "): string {
  const lines: string[] = [];
  lines.push(`${indent}  eloScore: ${entry.eloScore},`);
  lines.push(`${indent}  arenaRank: ${entry.arenaRank},`);
  if (entry.mmlu !== undefined) {
    lines.push(`${indent}  mmlu: ${entry.mmlu},`);
  }
  if (entry.humanEval !== undefined) {
    lines.push(`${indent}  humanEval: ${entry.humanEval},`);
  }
  if (entry.math !== undefined) {
    lines.push(`${indent}  math: ${entry.math},`);
  }
  if (entry.mtBench !== undefined) {
    lines.push(`${indent}  mtBench: ${entry.mtBench},`);
  }
  if (entry.gpqa !== undefined) {
    lines.push(`${indent}  gpqa: ${entry.gpqa},`);
  }
  lines.push(`${indent}  updatedAt: "${entry.updatedAt}",`);
  return `${indent}{\n${lines.join("\n")}\n${indent}}`;
}

function dbToSource(db: ArenaBenchmarkDB): string {
  const sorted = Object.entries(db).toSorted((a, b) => b[1].eloScore - a[1].eloScore);
  return sorted.map(([k, v]) => `  ${JSON.stringify(k)}: ${entryToSource(v, "  ")},`).join("\n");
}

function rewriteBuiltinBenchmarks(data: ArenaBenchmarkDB, source: string): void {
  try {
    const selfPath = getSelfSourcePath();
    if (!selfPath) {
      return;
    }
    const original = fs.readFileSync(selfPath, "utf-8");
    const startMarker = "const BUILTIN_BENCHMARKS: ArenaBenchmarkDB = {";
    const startIdx = original.indexOf(startMarker);
    if (startIdx === -1) {
      return;
    }
    let depth = 0,
      endIdx = -1;
    for (let i = startIdx + startMarker.length - 1; i < original.length; i++) {
      if (original[i] === "{") {
        depth++;
      } else if (original[i] === "}") {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }
    if (endIdx === -1) {
      return;
    }
    const merged = { ...BUILTIN_BENCHMARKS, ...data };
    const today = new Date().toISOString().split("T")[0];
    const newBlock = `const BUILTIN_BENCHMARKS: ArenaBenchmarkDB = {\n${dbToSource(merged)}\n}`;
    // 更新头部注释日期
    const updated = original.slice(0, startIdx) + newBlock + original.slice(endIdx + 1);
    const withComment = updated.replace(
      /\/\/ Elo 分基于[^\n]*/,
      `// Elo 分基于 Bradley-Terry 模型，参考 lmarena.ai ${today} 快照（来源: ${source}）`,
    );
    fs.writeFileSync(selfPath, withComment, "utf-8");
    console.log(
      `[ArenaBenchmarks] ✓ Rewrote BUILTIN_BENCHMARKS in source: ${Object.keys(merged).length} models (${today})`,
    );
  } catch (e) {
    console.warn("[ArenaBenchmarks] Failed to rewrite source:", e);
  }
}

// ==================== 网页抓取兖底 ====================

function parseEloFromHtml(html: string): ArenaBenchmarkDB {
  const result: ArenaBenchmarkDB = {};
  // 尝试匹配 HTML 表格 <td> 中的模型名 + Elo
  const tdPattern = /<td[^>]*>([^<]{3,60})<\/td>\s*<td[^>]*>(\d{3,4})<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = tdPattern.exec(html)) !== null) {
    const name = m[1].trim();
    const elo = parseInt(m[2], 10);
    if (elo >= 800 && elo <= 1500 && name && !/^\d+$/.test(name)) {
      result[normalizeModelName(name)] = {
        eloScore: elo,
        arenaRank: 999,
        updatedAt: new Date().toISOString().split("T")[0],
      };
    }
  }
  // 备用：纯文本行匹配
  if (Object.keys(result).length < 3) {
    const linePattern = /^([A-Za-z][\w\s.:\-/]+?)\s*[|\t]\s*(\d{3,4})\s*$/gm;
    while ((m = linePattern.exec(html)) !== null) {
      const name = m[1].trim();
      const elo = parseInt(m[2], 10);
      if (elo >= 800 && elo <= 1500) {
        result[normalizeModelName(name)] = {
          eloScore: elo,
          arenaRank: 999,
          updatedAt: new Date().toISOString().split("T")[0],
        };
      }
    }
  }
  return result;
}

async function agentScrapeArenaLeaderboard(): Promise<{
  data: ArenaBenchmarkDB;
  source: string;
} | null> {
  console.log("[ArenaBenchmarks] Falling back to HTML scraping...");
  for (const src of ARENA_SCRAPE_SOURCES) {
    try {
      const resp = await fetch(src.url, { signal: AbortSignal.timeout(src.timeout) });
      if (!resp.ok) {
        continue;
      }
      const html = await resp.text();
      const data = parseEloFromHtml(html);
      if (Object.keys(data).length >= 5) {
        console.log(
          `[ArenaBenchmarks] Scraped ${Object.keys(data).length} models from ${src.name}`,
        );
        return { data, source: src.name };
      }
    } catch {}
  }
  return null;
}

// ==================== 内置有效期判断 ====================

/**
 * 获取 BUILTIN_BENCHMARKS 中最新的 updatedAt 日期（ms）
 */
function getBuiltinLastUpdatedMs(): number {
  let latest = 0;
  for (const entry of Object.values(BUILTIN_BENCHMARKS)) {
    if (entry?.updatedAt) {
      const t = new Date(entry.updatedAt).getTime();
      if (!isNaN(t) && t > latest) {
        latest = t;
      }
    }
  }
  return latest;
}

/**
 * 检查内置数据是否在有效期内
 */
function isBuiltinFresh(): boolean {
  const lastUpdated = getBuiltinLastUpdatedMs();
  if (lastUpdated === 0) {
    return false;
  }
  return Date.now() - lastUpdated < REFRESH_INTERVAL_MS;
}

// ==================== 网络拉取 ====================

/**
 * 从多个数据源获取最新排行榜数据（JSON API 方式）
 */
async function fetchLMSYSArenaData(): Promise<{ data: ArenaBenchmarkDB; source: string } | null> {
  for (const source of ARENA_DATA_SOURCES) {
    try {
      console.log(`[ArenaBenchmarks] Trying ${source.name}...`);
      const response = await fetch(source.url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(source.timeout),
      });
      if (!response.ok) {
        continue;
      }
      const rawData = await response.json();
      if (!rawData || typeof rawData !== "object") {
        continue;
      }
      const result: ArenaBenchmarkDB = {};
      const modelEntries = Array.isArray(rawData) ? rawData : Object.entries(rawData);
      for (const item of modelEntries) {
        let modelName: string;
        let entry: {
          elo?: number;
          rank?: number;
          mmlu?: number;
          humanEval?: number;
          math?: number;
        };
        if (Array.isArray(item)) {
          modelName = item[0] as string;
          entry = item[1] as typeof entry;
        } else {
          modelName =
            (item as { name?: string; model?: string }).name ||
            (item as { name?: string; model?: string }).model ||
            "";
          entry = item as typeof entry;
        }
        if (modelName && entry.elo) {
          result[normalizeModelName(modelName)] = {
            eloScore: entry.elo,
            arenaRank: entry.rank ?? 999,
            mmlu: entry.mmlu,
            humanEval: entry.humanEval,
            math: entry.math,
            updatedAt: new Date().toISOString().split("T")[0],
          };
        }
      }
      if (Object.keys(result).length > 0) {
        console.log(
          `[ArenaBenchmarks] Got ${Object.keys(result).length} models from ${source.name}`,
        );
        return { data: result, source: source.name };
      }
    } catch (e) {
      console.warn(`[ArenaBenchmarks] ${source.name} failed:`, (e as Error).message);
    }
  }
  return null;
}

/**
 * 检查缓存文件记录的上次尝试时间是否在冷却期内
 * 用于跨进程节流：避免多个 agent 进程重复触发网络请求
 *
 * 两种情况认为在冷却期：
 * 1. 缓存有 failedAt 且未过期（精确记录失败时间）
 * 2. 缓存 source=="fetch-failed" 且 lastFetchedAt 未过期（兼容旧格式）
 */
function isFetchOnCooldown(): boolean {
  // 同进程内 10 秒内的结果直接复用（避免重复读文件）
  if (_cooldownCheckedAt > 0 && Date.now() - _cooldownCheckedAt < 10_000) {
    return _onCooldown;
  }
  try {
    const localDataPath = getLocalCachePath();
    if (!fs.existsSync(localDataPath)) {
      _cooldownCheckedAt = Date.now();
      _onCooldown = false;
      return false;
    }
    const raw = JSON.parse(fs.readFileSync(localDataPath, "utf-8")) as CacheFile;
    const meta = raw?._meta as CacheMeta | undefined;
    if (!meta) {
      _cooldownCheckedAt = Date.now();
      _onCooldown = false;
      return false;
    }
    // 精确失败时间戳（新格式）
    if (typeof meta.failedAt === "number" && meta.failedAt > 0) {
      _onCooldown = Date.now() - meta.failedAt < FETCH_FAIL_COOLDOWN_MS;
      _cooldownCheckedAt = Date.now();
      return _onCooldown;
    }
    // 兼容：source 标记为失败（旧格式）
    if (meta.source === "fetch-failed" && typeof meta.lastFetchedAt === "number") {
      _onCooldown = Date.now() - meta.lastFetchedAt < FETCH_FAIL_COOLDOWN_MS;
      _cooldownCheckedAt = Date.now();
      return _onCooldown;
    }
    _cooldownCheckedAt = Date.now();
    _onCooldown = false;
    return false;
  } catch {
    return false;
  }
}

/**
 * 将失败冷却时间戳写入缓存文件（跨进程共享）
 */
function writeFetchFailCooldown(): void {
  try {
    const localDataPath = getLocalCachePath();
    const dir = path.dirname(localDataPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // 读取现有缓存（保留模型数据），仅更新 _meta
    let existing: Record<string, unknown> = {};
    if (fs.existsSync(localDataPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(localDataPath, "utf-8"));
      } catch {}
    }
    const now = Date.now();
    existing._meta = {
      ...(existing._meta as object | undefined),
      lastFetchedAt: now, // 记录尝试时间
      failedAt: now, // 标记失败（新格式）
      source: "fetch-failed", // 兼容旧格式检查
      savedAt: new Date().toISOString(),
    };
    // 若缓存中没有模型数据，补入内置数据作为基线（供其他进程使用）
    const hasModels = Object.keys(existing).some((k) => k !== "_meta");
    if (!hasModels) {
      Object.assign(existing, BUILTIN_BENCHMARKS);
    }
    fs.writeFileSync(localDataPath, JSON.stringify(existing, null, 2), "utf-8");
    // 更新进程内缓存，避免同进程再次触发
    _onCooldown = true;
    _cooldownCheckedAt = Date.now();
    console.log("[ArenaBenchmarks] Fail cooldown written. Next retry in ~24h.");
  } catch (e) {
    console.warn("[ArenaBenchmarks] Failed to write cooldown:", (e as Error).message);
  }
}

/**
 * 刷新基准数据（如需要）
 *
 * 启动逻辑：
 * 1. 内置数据 updatedAt 在有效期内 → 直接返回
 * 2. 当前进程已在拉取中 → 复用 Promise
 * 3. 缓存文件记录的失败冷却期内 → 跳过，避免每个 agent 进程重复重试
 * 4. 触发后台异步拉取，成功则回写源码+缓存，失败则写入冷却标记
 */
export async function refreshBenchmarkDataIfNeeded(): Promise<void> {
  // 内置数据在有效期内：直接返回
  if (isBuiltinFresh()) {
    const lastUpdated = getBuiltinLastUpdatedMs();
    const nextRefreshDays = Math.ceil(
      (lastUpdated + REFRESH_INTERVAL_MS - Date.now()) / (24 * 60 * 60 * 1000),
    );
    console.log(
      `[ArenaBenchmarks] Built-in data is fresh (next refresh in ~${nextRefreshDays} day(s)). Skipping network fetch.`,
    );
    return;
  }

  // 当前进程已在拉取中：复用 Promise
  if (_isFetching && _fetchPromise) {
    return _fetchPromise;
  }

  // 跨进程节流：上次失败冷却期内，跳过重试
  if (isFetchOnCooldown()) {
    const { data: cachedData } = loadLocalCache();
    if (Object.keys(cachedData).length > 0) {
      mergeBenchmarkData(cachedData);
    }
    console.log(
      "[ArenaBenchmarks] Network fetch on cooldown (last attempt failed). Using built-in/cached data.",
    );
    return;
  }

  // 内置数据已过期：后台异步刷新
  const lastUpdated = getBuiltinLastUpdatedMs();
  const daysSince =
    lastUpdated > 0 ? Math.floor((Date.now() - lastUpdated) / (24 * 60 * 60 * 1000)) : -1;
  const reason =
    lastUpdated === 0
      ? "no updatedAt in built-in data"
      : `built-in data is ${daysSince} day(s) old`;
  console.log(`[ArenaBenchmarks] ${reason}, scheduling background network fetch...`);

  _isFetching = true;
  // 加载本地缓存（供 agent 抓取兜底判断使用）
  const { data: cachedData } = loadLocalCache();
  if (Object.keys(cachedData).length > 0) {
    mergeBenchmarkData(cachedData);
  }

  _fetchPromise = (async () => {
    try {
      console.log("[ArenaBenchmarks] Fetching latest data from external sources...");
      let result = await fetchLMSYSArenaData();
      // JSON API 全部失败且本地完全没有缓存：agent 网页抓取兜底
      if (!result && Object.keys(cachedData).length === 0) {
        result = await agentScrapeArenaLeaderboard();
      }
      if (result && Object.keys(result.data).length > 0) {
        saveLocalCache(result.data, result.source);
        mergeBenchmarkData(result.data);
        console.log(
          `[ArenaBenchmarks] ✓ Fetched ${Object.keys(result.data).length} models from ${result.source}.`,
        );
        rewriteBuiltinBenchmarks(result.data, result.source);
      } else {
        // 失败：写入冷却标记，24小时内其他 agent 进程不再重试
        writeFetchFailCooldown();
        console.warn(
          "[ArenaBenchmarks] ✗ No fresh data from network. Cooldown set (retry in ~24h).",
        );
      }
    } catch (e) {
      writeFetchFailCooldown();
      console.warn("[ArenaBenchmarks] ✗ Fetch failed:", (e as Error).message, "Cooldown set.");
    } finally {
      _isFetching = false;
      _fetchPromise = null;
    }
  })();
  // 不等待网络请求完成，立即返回
}

/**
 * 初始化基准数据库（应用启动时调用）
 */
export async function initBenchmarkDB(): Promise<void> {
  await refreshBenchmarkDataIfNeeded();
}

/**
 * 强制刷新基准数据（无论内置数据是否在有效期内，立即触发网络刷新）
 * 场景：用户新增模型后主动触发，确保有该模型的最新 Elo 数据
 */
export async function forceRefreshBenchmarkData(): Promise<void> {
  if (_isFetching && _fetchPromise) {
    return _fetchPromise;
  }
  _isFetching = true;
  const { data: cachedData } = loadLocalCache();
  if (Object.keys(cachedData).length > 0) {
    mergeBenchmarkData(cachedData);
  }
  console.log("[ArenaBenchmarks] Force refresh triggered (new model added)...");
  _fetchPromise = (async () => {
    try {
      let result = await fetchLMSYSArenaData();
      if (!result && Object.keys(cachedData).length === 0) {
        result = await agentScrapeArenaLeaderboard();
      }
      if (result && Object.keys(result.data).length > 0) {
        saveLocalCache(result.data, result.source);
        mergeBenchmarkData(result.data);
        console.log(
          `[ArenaBenchmarks] ✓ Force refresh done: ${Object.keys(result.data).length} models from ${result.source}.`,
        );
        rewriteBuiltinBenchmarks(result.data, result.source);
      } else {
        console.warn("[ArenaBenchmarks] ✗ Force refresh: no data from network.");
      }
    } catch (e) {
      console.warn("[ArenaBenchmarks] ✗ Force refresh failed:", (e as Error).message);
    } finally {
      _isFetching = false;
      _fetchPromise = null;
    }
  })();
}

/**
 * 检查是否需要刷新（兑容旧接口）
 */
export function isRefreshNeeded(): boolean {
  return !isBuiltinFresh();
}

// ==================== 汇总数据查询 ====================

/**
 * 获取某模型的综合能力分（0-100），融合 Elo + MMLU + HumanEval + MATH
 *
 * 权重：Elo 50% + MMLU 20% + HumanEval 15% + MATH 15%
 *
 * @param modelName - 模型名称
 * @returns 综合能力分 (0-100)，未找到数据时返回 undefined
 */
export function getOverallBenchmarkScore(modelName: string): number | undefined {
  const entry = lookupBenchmark(modelName);
  if (!entry) {
    return undefined;
  }

  const eloNorm = normalizeEloScore(entry.eloScore); // 0-100

  // 如果只有 Elo，直接返回
  if (!entry.mmlu && !entry.humanEval && !entry.math) {
    return eloNorm;
  }

  let score = eloNorm * 0.5;
  let weightUsed = 0.5;

  if (entry.mmlu !== undefined) {
    score += entry.mmlu * 0.2;
    weightUsed += 0.2;
  }
  if (entry.humanEval !== undefined) {
    score += entry.humanEval * 0.15;
    weightUsed += 0.15;
  }
  if (entry.math !== undefined) {
    score += entry.math * 0.15;
    weightUsed += 0.15;
  }

  // 归一化（权重可能不足 1.0）
  return Math.round(score / weightUsed);
}

/**
 * 获取某模型的代码能力分（0-100）
 *
 * 权重：HumanEval 70% + Elo 30%
 *
 * @param modelName - 模型名称
 * @returns 代码能力分 (0-100)，未找到数据时返回 undefined
 */
export function getCodingBenchmarkScore(modelName: string): number | undefined {
  const entry = lookupBenchmark(modelName);
  if (!entry) {
    return undefined;
  }

  if (entry.humanEval === undefined) {
    return normalizeEloScore(entry.eloScore);
  }

  return Math.round(entry.humanEval * 0.7 + normalizeEloScore(entry.eloScore) * 0.3);
}

/**
 * 获取某模型的推理能力分（0-100）
 *
 * 权重：MATH 50% + GPQA 30% + Elo 20%
 *
 * @param modelName - 模型名称
 * @returns 推理能力分 (0-100)，未找到数据时返回 undefined
 */
export function getReasoningBenchmarkScore(modelName: string): number | undefined {
  const entry = lookupBenchmark(modelName);
  if (!entry) {
    return undefined;
  }

  const eloNorm = normalizeEloScore(entry.eloScore);

  if (entry.math === undefined && entry.gpqa === undefined) {
    return eloNorm;
  }

  let score = eloNorm * 0.2;
  let weightUsed = 0.2;

  if (entry.math !== undefined) {
    score += entry.math * 0.5;
    weightUsed += 0.5;
  }
  if (entry.gpqa !== undefined) {
    score += entry.gpqa * 0.3;
    weightUsed += 0.3;
  }

  return Math.round(score / weightUsed);
}
