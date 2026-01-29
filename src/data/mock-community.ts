import type { FlowItem } from '../components/SupplyDepotApp';

export interface SharedFlowList {
  id: string;
  title: string;
  description: string;
  coverImage?: string; // 封面图 URL
  tags: string[];
  author: {
    id: string;
    name: string;
    avatar?: string;
  };
  items: FlowItem[];
  playCount: number;
  likeCount: number;
  createdAt: string;
  updatedAt: string;
  isPGC?: boolean; // 是否为官方 PGC 内容
}

/* ========== 外部 JSON 数据结构 ========== */

interface ExternalFlowItem {
  id: string;
  title: string;
  duration: string;
  type: string;
  scene: string;
  audioUrl: string;
  script?: { speaker: string; text: string }[] | null;
  scriptUrl?: string;
  knowledgeCardsCount?: number;
  contentCategory?: { main: string; aux: string[] };
  mode?: 'quick_summary' | 'deep_analysis'; // UGC 模式
}

interface ExternalSharedFlowList {
  id: string;
  title: string;
  description: string;
  coverImage?: string;
  tags: string[];
  author: { id: string; name: string; avatar?: string };
  items: ExternalFlowItem[];
  playCount: number;
  likeCount: number;
  createdAt: string;
  updatedAt: string;
  isPGC: boolean;
}

interface ExternalCommunityData {
  pgc: ExternalSharedFlowList[];
  ugc: ExternalSharedFlowList[];
}

// 辅助函数：生成随机 ID
const randomId = () => Math.random().toString(36).slice(2, 11);

// 预定义的一些作者
const authors = [
  { id: 'u1', name: 'FlowMaster', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=FlowMaster' },
  { id: 'u2', name: 'LearningGeek', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=LearningGeek' },
  { id: 'u3', name: 'DailyZen', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=DailyZen' },
  { id: 'u4', name: 'TechExplorer', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=TechExplorer' },
];

/* ========== 转换函数 ========== */

// 外部格式 → 内部 FlowItem 格式
const convertExternalItem = (extItem: ExternalFlowItem): FlowItem => {
  // UGC mode: 'quick_summary' | 'deep_analysis' → FlowItem mode: 'single' | 'dual'
  const modeMapping: Record<string, 'single' | 'dual'> = {
    'quick_summary': 'single',
    'deep_analysis': 'dual'
  };
  const mode = modeMapping[extItem.mode || ''] || 'single';

  const item: FlowItem = {
    id: extItem.id,
    title: extItem.title,
    duration: extItem.duration,
    type: extItem.type,
    tldr: '这是一个示例 FlowItem 的简介...',
    subtitles: [],
    status: 'ready',
    scenes: [extItem.scene],
    subject: 'general',
    mode,
    contentType: mode === 'dual' ? 'discussion' : 'output',
    sceneTag: extItem.scene as any,
    isGenerating: false,
    audioUrl: extItem.audioUrl,
    script: extItem.script || undefined,
    knowledgeCards: [],
    playbackProgress: { hasStarted: false }
  };

  // 扩展字段（用于 UGC 内容）
  if (extItem.contentCategory) {
    (item as any).contentCategory = extItem.contentCategory;
  }
  if (extItem.scriptUrl) {
    (item as any).scriptUrl = extItem.scriptUrl;
  }

  return item;
};

const convertExternalList = (extList: ExternalSharedFlowList): SharedFlowList => ({
  id: extList.id,
  title: extList.title,
  description: extList.description,
  coverImage: extList.coverImage,
  tags: extList.tags,
  author: extList.author,
  items: extList.items.map(convertExternalItem),
  playCount: extList.playCount,
  likeCount: extList.likeCount,
  createdAt: extList.createdAt,
  updatedAt: extList.updatedAt,
  isPGC: extList.isPGC
});

/* ========== 数据加载 ========== */

let cachedCommunityData: ExternalCommunityData | null = null;

export const loadCommunityData = async (): Promise<ExternalCommunityData> => {
  if (cachedCommunityData) {
    return cachedCommunityData;
  }

  try {
    const response = await fetch('/data/community-content.json');
    if (!response.ok) throw new Error('Failed to fetch');
    const data = await response.json() as ExternalCommunityData;
    cachedCommunityData = data;
    return data;
  } catch (error) {
    console.error('Failed to load community data:', error);
    // 降级到内置 Mock 数据
    return {
      pgc: [],
      ugc: MOCK_COMMUNITY_LISTS.map(list => ({ ...list, isPGC: false, items: [] }))
    };
  }
};

// 创建 Mock FlowItem
const createMockFlowItem = (title: string, duration: string, type: 'insight' | 'review' | 'meditation', scene: string): FlowItem => ({
  id: randomId(),
  title,
  duration,
  type,
  tldr: '这是一个示例 FlowItem 的简介...',
  subtitles: [],
  status: 'ready',
  scenes: [scene],
  subject: 'general',
  mode: 'single',
  contentType: 'output',
  sceneTag: scene as any,
  isGenerating: false,
  playbackProgress: { hasStarted: false }
});

// Mock FlowLists
export const MOCK_COMMUNITY_LISTS: SharedFlowList[] = [
  {
    id: 'l1',
    title: '初中数学：必考函数与几何基础',
    description: '覆盖初中阶段最核心的函数与几何考点，用听的方式帮你吃透概念与题型。',
    tags: ['初中', '数学', '函数', '几何'],
    author: authors[0],
    playCount: 1820,
    likeCount: 620,
    createdAt: '2024-03-01T08:00:00Z',
    updatedAt: '2024-03-05T08:00:00Z',
    items: [
      createMockFlowItem('一次函数基础概念与图像特征', '08:30', 'insight', 'focus'),
      createMockFlowItem('二元一次方程与实际应用题', '09:20', 'insight', 'focus'),
      createMockFlowItem('三角形相似判定与比例线段', '10:10', 'insight', 'focus'),
    ]
  },
  {
    id: 'l2',
    title: '初中物理：力学与电学核心考点',
    description: '精选初中物理易错与高频考点，用生活化例子讲清楚受力分析、电路与压强。',
    tags: ['初中', '物理', '力学', '电学'],
    author: authors[1],
    playCount: 1560,
    likeCount: 540,
    createdAt: '2024-03-10T14:30:00Z',
    updatedAt: '2024-03-15T10:00:00Z',
    items: [
      createMockFlowItem('受力分析与牛顿第一定律', '07:40', 'insight', 'focus'),
      createMockFlowItem('压强与浮力：常见实验题梳理', '09:05', 'insight', 'focus'),
      createMockFlowItem('串并联电路与电流电压关系', '11:20', 'insight', 'focus'),
    ]
  },
  {
    id: 'l3',
    title: '初中化学：方程式与基本实验安全',
    description: '从零开始带你熟悉化学符号、常见反应方程式和必考实验现象，打牢入门基础。',
    tags: ['初中', '化学', '方程式', '实验'],
    author: authors[2],
    playCount: 1430,
    likeCount: 510,
    createdAt: '2024-04-01T19:00:00Z',
    updatedAt: '2024-04-08T20:00:00Z',
    items: [
      createMockFlowItem('常见元素符号与化合价快速记忆', '06:30', 'insight', 'home_charge'),
      createMockFlowItem('化学方程式配平的三种常用方法', '09:50', 'insight', 'home_charge'),
      createMockFlowItem('实验安全与气体制取现象汇总', '08:40', 'review', 'home_charge'),
    ]
  },
  {
    id: 'l4',
    title: '高中数学：函数、导数与不等式',
    description: '围绕高考常考的函数、导数与不等式专题，帮助你在刷题前先理顺知识结构。',
    tags: ['高中', '数学', '函数', '导数'],
    author: authors[3],
    playCount: 2100,
    likeCount: 890,
    createdAt: '2024-05-01T10:00:00Z',
    updatedAt: '2024-05-06T10:00:00Z',
    items: [
      createMockFlowItem('解析几何中的一次函数与二次函数模型', '11:30', 'insight', 'focus'),
      createMockFlowItem('导数在单调性与极值中的经典用法', '12:20', 'insight', 'focus'),
      createMockFlowItem('基本不等式与放缩技巧精讲', '10:15', 'insight', 'focus'),
    ]
  },
  {
    id: 'l5',
    title: '高中语文：作文素材与名篇精读',
    description: '精选适合高考作文的中国教育与青春成长主题素材，配合名篇段落精读讲解。',
    tags: ['高中', '语文', '作文', '阅读理解'],
    author: authors[1],
    playCount: 2680,
    likeCount: 1200,
    createdAt: '2024-04-18T09:00:00Z',
    updatedAt: '2024-04-22T09:00:00Z',
    items: [
      createMockFlowItem('教育公平与成长故事：高分立意拆解', '07:20', 'insight', 'qa_memory'),
      createMockFlowItem('如何在作文中自然引用古诗文', '06:40', 'insight', 'qa_memory'),
      createMockFlowItem('议论文常见论证结构与过渡句式', '08:10', 'insight', 'qa_memory'),
    ]
  },
  {
    id: 'l6',
    title: '高中英语：完形与阅读高频词汇',
    description: '围绕完形填空与阅读理解中高频出现的教育、校园与学习主题词汇展开讲解。',
    tags: ['高中', '英语', '词汇', '阅读'],
    author: authors[0],
    playCount: 1930,
    likeCount: 730,
    createdAt: '2024-03-28T16:00:00Z',
    updatedAt: '2024-04-02T16:00:00Z',
    items: [
      createMockFlowItem('校园生活与课堂场景高频词', '09:00', 'insight', 'focus'),
      createMockFlowItem('教育议题类阅读常见表达', '08:30', 'insight', 'focus'),
      createMockFlowItem('完形填空中易混近义词辨析', '10:40', 'insight', 'focus'),
    ]
  },
  {
    id: 'l7',
    title: '中考总复习：政治与历史主干线',
    description: '精选中考思想品德与中国历史的主干知识线，适合睡前或碎片时间反复听背。',
    tags: ['初中', '中考', '道德与法治', '历史'],
    author: authors[2],
    playCount: 2240,
    likeCount: 960,
    createdAt: '2024-05-20T08:00:00Z',
    updatedAt: '2024-05-25T08:00:00Z',
    items: [
      createMockFlowItem('中国近代史重要事件时间轴', '12:00', 'review', 'qa_memory'),
      createMockFlowItem('公民权利与义务核心考点串讲', '11:10', 'review', 'qa_memory'),
      createMockFlowItem('世界多极化与经济全球化要点', '09:30', 'review', 'qa_memory'),
    ]
  },
  {
    id: 'l8',
    title: '高考冲刺：理综错题回顾与心态调整',
    description: '将物理、化学、生物中的典型易错题用音频方式再过一遍，配合简单的考试心态调整练习。',
    tags: ['高中', '高考', '理综', '备考'],
    author: authors[3],
    playCount: 3050,
    likeCount: 1320,
    createdAt: '2024-06-01T07:00:00Z',
    updatedAt: '2024-06-03T07:00:00Z',
    items: [
      createMockFlowItem('物理解题中常见的受力漏画点', '06:50', 'insight', 'commute'),
      createMockFlowItem('化学计算题比例与守恒思路', '07:30', 'insight', 'commute'),
      createMockFlowItem('生物选择题审题陷阱与排除法', '06:40', 'meditation', 'sleep_meditation'),
    ]
  }
];

/* ========== 导出函数 ========== */

// 同步版本（降级用）
export const getCommunityListsSync = () => {
  return MOCK_COMMUNITY_LISTS;
};

// 异步版本：加载所有列表
export const getCommunityLists = async (): Promise<SharedFlowList[]> => {
  const data = await loadCommunityData();
  const pgcConverted = data.pgc.map(convertExternalList);
  const ugcConverted = data.ugc.map(convertExternalList);
  return [...pgcConverted, ...ugcConverted];
};

// 异步版本：仅 PGC
export const getPGCLists = async (): Promise<SharedFlowList[]> => {
  const data = await loadCommunityData();
  return data.pgc.map(convertExternalList);
};

// 异步版本：仅 UGC
export const getUGCLists = async (): Promise<SharedFlowList[]> => {
  const data = await loadCommunityData();
  return data.ugc.map(convertExternalList);
};

// 本地存储的 mock 数据
let localCommunityLists = [...MOCK_COMMUNITY_LISTS];

export const addCommunityList = (list: SharedFlowList) => {
  localCommunityLists = [list, ...localCommunityLists];
  return localCommunityLists;
};
