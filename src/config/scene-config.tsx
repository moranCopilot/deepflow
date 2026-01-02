import { Car, Home, Focus, Moon, RefreshCw, Radio, MessageCircle } from 'lucide-react';

export type SceneTag = 'commute' | 'home_charge' | 'focus' | 'sleep_meditation' | 'qa_memory' | 'daily_review' | 'default';

export type BackgroundEffectType = 'night_quiet' | 'library' | 'snow_city' | null;

export const SCENE_CONFIGS: Record<SceneTag, { 
  tag: SceneTag; 
  label: string; 
  icon: any; 
  description: string;
  backgroundEffect: BackgroundEffectType;
  audioPrompt?: string;
}> = {
  commute: {
    tag: 'commute',
    label: '回家路上',
    icon: Car,
    description: '通勤、步行或驾驶途中',
    backgroundEffect: 'snow_city',
    audioPrompt: '/assets/audio/prompts/snow-commute.mp3'
  },
  home_charge: {
    tag: 'home_charge',
    label: '在家充电',
    icon: Home,
    description: '居家恢复',
    backgroundEffect: null
  },
  focus: {
    tag: 'focus',
    label: '静坐专注',
    icon: Focus,
    description: '专注学习',
    backgroundEffect: 'library',
    audioPrompt: '/assets/audio/prompts/library-study.mp3'
  },
  sleep_meditation: {
    tag: 'sleep_meditation',
    label: '睡前冥想',
    icon: Moon,
    description: '睡前放松',
    backgroundEffect: 'night_quiet',
    audioPrompt: '/assets/audio/prompts/night-quiet.mp3'
  },
  qa_memory: {
    tag: 'qa_memory',
    label: '问答式记忆',
    icon: MessageCircle,
    description: '记忆强化',
    backgroundEffect: 'library',
    audioPrompt: '/assets/audio/prompts/library-study.mp3'
  },
  daily_review: {
    tag: 'daily_review',
    label: '今日复盘',
    icon: RefreshCw,
    description: '今日学习复盘',
    backgroundEffect: 'library',
    audioPrompt: '/assets/audio/prompts/library-study.mp3'
  },
  default: {
    tag: 'default',
    label: '默认',
    icon: Radio,
    description: '通用场景',
    backgroundEffect: null
  }
};

export type FormType = '速听' | '深度' | '对话' | '时事资讯' | '音乐';

export type SlotId =
  | 'morning_wakeup'
  | 'morning_fast'
  | 'class_break_morning'
  | 'morning_focus'
  | 'noon_fast'
  | 'noon_news'
  | 'noon_rest'
  | 'class_break_afternoon'
  | 'afternoon_focus'
  | 'feynman_memory'
  | 'pre_dinner_fast'
  | 'post_dinner_news'
  | 'evening_focus'
  | 'evening_imprint'
  | 'sleep_relax'
  | 'default_slot';

export type SlotContentRule = 'arts' | 'science' | 'any' | 'push' | 'fallback';

export type SlotDefinition = {
  id: SlotId;
  label: string;
  contentRule: SlotContentRule;
  formRules: FormType[];
  environmentSceneTag?: SceneTag;
  isFixedPush?: boolean;
  isFallback?: boolean;
};

export const SLOT_DEFINITIONS: SlotDefinition[] = [
  { id: 'morning_wakeup', label: '晨间唤醒', contentRule: 'arts', formRules: ['对话'], environmentSceneTag: 'commute' },
  { id: 'morning_fast', label: '早间速刷', contentRule: 'arts', formRules: ['速听'], environmentSceneTag: 'commute' },
  { id: 'class_break_morning', label: '课间拾遗-上午', contentRule: 'any', formRules: ['速听', '对话'], environmentSceneTag: 'commute' },
  { id: 'morning_focus', label: '上午专注', contentRule: 'science', formRules: ['深度'], environmentSceneTag: 'focus' },
  { id: 'noon_fast', label: '午间速刷', contentRule: 'arts', formRules: ['速听', '对话'], environmentSceneTag: 'commute' },
  { id: 'noon_news', label: '午间博闻', contentRule: 'push', formRules: ['时事资讯'], environmentSceneTag: 'commute', isFixedPush: true },
  { id: 'noon_rest', label: '午间休憩', contentRule: 'push', formRules: ['音乐'], environmentSceneTag: 'sleep_meditation', isFixedPush: true },
  { id: 'class_break_afternoon', label: '课间拾遗-下午', contentRule: 'any', formRules: ['速听', '对话'], environmentSceneTag: 'commute' },
  { id: 'afternoon_focus', label: '下午专注', contentRule: 'any', formRules: ['深度'], environmentSceneTag: 'focus' },
  { id: 'feynman_memory', label: '费曼巧记', contentRule: 'any', formRules: ['对话'], environmentSceneTag: 'focus' },
  { id: 'pre_dinner_fast', label: '餐前速刷', contentRule: 'any', formRules: ['速听', '对话'], environmentSceneTag: 'commute' },
  { id: 'post_dinner_news', label: '餐后博闻', contentRule: 'push', formRules: ['时事资讯'], environmentSceneTag: 'commute', isFixedPush: true },
  { id: 'evening_focus', label: '晚间专注', contentRule: 'any', formRules: ['深度'], environmentSceneTag: 'focus' },
  { id: 'evening_imprint', label: '晚间印刻', contentRule: 'any', formRules: ['速听', '对话'], environmentSceneTag: 'commute' },
  { id: 'sleep_relax', label: '睡前放松', contentRule: 'push', formRules: ['音乐'], environmentSceneTag: 'sleep_meditation', isFixedPush: true },
  { id: 'default_slot', label: '默认场景', contentRule: 'fallback', formRules: ['速听', '深度', '对话', '时事资讯', '音乐'], environmentSceneTag: 'default', isFallback: true }
];
