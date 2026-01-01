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
    title: '早安通勤：高效能人士的早晨',
    description: '精选 15 分钟新闻与科技动态，适合早高峰通勤收听，快速获取今日资讯。',
    tags: ['通勤', '科技', '新闻', '早晨'],
    author: authors[3],
    playCount: 1250,
    likeCount: 328,
    createdAt: '2023-12-01T08:00:00Z',
    updatedAt: '2023-12-05T08:00:00Z',
    items: [
      createMockFlowItem('AI 行业最新动态日报', '05:30', 'insight', 'commute'),
      createMockFlowItem('硅谷科技周报', '08:45', 'insight', 'commute'),
      createMockFlowItem('高效工作法：番茄钟', '04:20', 'insight', 'commute'),
    ]
  },
  {
    id: 'l2',
    title: '深度专注：沉浸式学习心流',
    description: '包含白噪音背景的深度学习资料解析，帮助你快速进入心流状态。',
    tags: ['专注', '学习', '心流', '深度解析'],
    author: authors[1],
    playCount: 890,
    likeCount: 456,
    createdAt: '2023-11-20T14:30:00Z',
    updatedAt: '2023-12-10T10:00:00Z',
    items: [
      createMockFlowItem('量子力学基础概念解析', '12:10', 'insight', 'focus'),
      createMockFlowItem('费曼学习法实战指南', '08:15', 'insight', 'focus'),
      createMockFlowItem('认知心理学导论', '15:30', 'insight', 'focus'),
    ]
  },
  {
    id: 'l3',
    title: '睡前冥想：放下一天的疲惫',
    description: '柔和的语调，舒缓的节奏，带你回顾一天并安然入睡。',
    tags: ['助眠', '冥想', '放松', '心理健康'],
    author: authors[2],
    playCount: 2340,
    likeCount: 890,
    createdAt: '2023-10-15T22:00:00Z',
    updatedAt: '2023-12-08T22:00:00Z',
    items: [
      createMockFlowItem('今日感恩日记', '05:00', 'review', 'sleep_meditation'),
      createMockFlowItem('全身扫描放松引导', '10:00', 'meditation', 'sleep_meditation'),
      createMockFlowItem('白噪音：雨夜', '30:00', 'meditation', 'sleep_meditation'),
    ]
  },
  {
    id: 'l4',
    title: '周末充电站：人文历史漫谈',
    description: '轻松有趣的历史故事，适合周末闲暇时光，增长见识。',
    tags: ['历史', '人文', '周末', '休闲'],
    author: authors[0],
    playCount: 560,
    likeCount: 120,
    createdAt: '2023-12-09T10:00:00Z',
    updatedAt: '2023-12-09T10:00:00Z',
    items: [
      createMockFlowItem('大唐盛世的饮食文化', '09:20', 'insight', 'home_charge'),
      createMockFlowItem('文艺复兴时期的艺术大师', '11:45', 'insight', 'home_charge'),
      createMockFlowItem('丝绸之路上的奇闻异事', '08:30', 'insight', 'home_charge'),
    ]
  },
  {
    id: 'l5',
    title: '英语磨耳朵：地道口语表达',
    description: '精选日常英语对话和常用俚语，利用碎片时间提升语感。',
    tags: ['英语', '语言学习', '口语', '碎片时间'],
    author: authors[1],
    playCount: 3400,
    likeCount: 1200,
    createdAt: '2023-11-05T09:00:00Z',
    updatedAt: '2023-12-11T09:00:00Z',
    items: [
      createMockFlowItem('咖啡店点餐常用语', '03:15', 'insight', 'qa_memory'),
      createMockFlowItem('商务邮件写作技巧', '06:40', 'insight', 'qa_memory'),
      createMockFlowItem('美剧常用俚语解析', '05:50', 'insight', 'qa_memory'),
    ]
  },
  {
    id: 'l6',
    title: '产品经理思维训练',
    description: '从用户体验到商业模式，全方位解析产品设计背后的逻辑。',
    tags: ['产品经理', '互联网', '思维模型', '职场'],
    author: authors[3],
    playCount: 780,
    likeCount: 230,
    createdAt: '2023-11-28T16:00:00Z',
    updatedAt: '2023-12-02T16:00:00Z',
    items: [
      createMockFlowItem('用户需求分析方法论', '10:20', 'insight', 'focus'),
      createMockFlowItem('MVP 最小可行性产品实战', '08:50', 'insight', 'focus'),
      createMockFlowItem('数据驱动决策案例分析', '12:00', 'insight', 'focus'),
    ]
  },
  {
    id: 'l7',
    title: '考研政治冲刺背诵',
    description: '核心考点串讲，适合考研党磨耳朵记忆。',
    tags: ['考研', '政治', '背诵', '考试'],
    author: authors[1],
    playCount: 1560,
    likeCount: 670,
    createdAt: '2023-10-20T08:00:00Z',
    updatedAt: '2023-12-10T08:00:00Z',
    items: [
      createMockFlowItem('马原核心原理概括', '15:00', 'insight', 'qa_memory'),
      createMockFlowItem('毛中特重要会议梳理', '12:30', 'insight', 'qa_memory'),
      createMockFlowItem('史纲时间轴串讲', '10:45', 'insight', 'qa_memory'),
    ]
  },
  {
    id: 'l8',
    title: '每日财经早报',
    description: '五分钟听懂全球市场变化，投资理财必备。',
    tags: ['财经', '投资', '股市', '理财'],
    author: authors[3],
    playCount: 2100,
    likeCount: 540,
    createdAt: '2023-12-12T07:00:00Z',
    updatedAt: '2023-12-12T07:00:00Z',
    items: [
      createMockFlowItem('美联储议息会议解读', '06:10', 'insight', 'commute'),
      createMockFlowItem('A股市场板块轮动分析', '05:40', 'insight', 'commute'),
      createMockFlowItem('黄金价格走势预测', '04:30', 'insight', 'commute'),
    ]
  }
];

// 本地存储的 mock 数据
let localCommunityLists = [...MOCK_COMMUNITY_LISTS];

export const getCommunityLists = () => {
  return localCommunityLists;
};

export const addCommunityList = (list: SharedFlowList) => {
  localCommunityLists = [list, ...localCommunityLists];
  return localCommunityLists;
};
