/**
 * [INPUT]: 依赖 {逐字稿JSON文件} 的 {数据}
 * [OUTPUT]: 提供 {ItemScript类型和加载函数}
 * [POS]: utils 的 {逐字稿加载器}
 *
 * 变更时更新此头部，然后检查 CLAUDE.md
 */

/* ========== 类型定义 ========== */

export interface ScriptItem {
  speaker: string;
  text: string;
}

export interface KnowledgeCard {
  id: string;
  title: string;
  content: string;
  tags: string[];
}

export interface ContentCategory {
  main?: string;
  aux?: string[];
}

export interface ItemScript {
  itemId: string;
  title: string;
  mode: 'quick_summary' | 'deep_analysis';
  script: ScriptItem[];
  knowledgeCards: KnowledgeCard[];
  contentCategory: ContentCategory;
  metadata: {
    duration: string;
    wordCount: number;
    createdAt: string;
    source: string;
  };
}

/* ========== 加载函数 ========== */

/**
 * 加载 UGC Item 的逐字稿 JSON
 * @param itemId Item ID (如 "ugc-1-item-1")
 * @returns 逐字稿数据，如果加载失败返回 null
 */
export async function loadItemScript(itemId: string): Promise<ItemScript | null> {
  try {
    const response = await fetch(`/data/scripts/ugc/${itemId}.json`);
    if (!response.ok) {
      console.warn(`Failed to load script for ${itemId}: ${response.status}`);
      return null;
    }
    const data = await response.json() as ItemScript;
    return data;
  } catch (error) {
    console.error(`Error loading script for ${itemId}:`, error);
    return null;
  }
}

/**
 * 检查 Item 是否有可用的逐字稿
 * @param itemId Item ID
 * @returns 是否有逐字稿
 */
export function hasItemScript(itemId: string): boolean {
  // 检查是否是 UGC item 格式 (ugc-X-item-Y)
  return /^ugc-\d+-item-\d+$/.test(itemId);
}
