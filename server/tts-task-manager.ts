/**
 * TTS 任务管理系统
 * 使用内存存储任务状态（生产环境可替换为 Redis）
 */

export interface TTSProgress {
  stage: 'preparing' | 'calling-api' | 'processing' | 'generating' | 'completed' | 'failed';
  message: string;
  percentage?: number; // 0-100
  estimatedSecondsRemaining?: number;
  details?: {
    scriptLength?: number;
    processedScripts?: number;
    apiCallTime?: number;
  };
}

export interface TTSTask {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: TTSProgress;
  result?: {
    url?: string;
    urls?: string[];
    duration?: number;
  };
  error?: string;
  createdAt: number;
}

// 内存任务存储
const taskStore = new Map<string, TTSTask>();

// 清理过期任务（超过 10 分钟）
const TASK_EXPIRY_MS = 10 * 60 * 1000;

/**
 * 生成任务 ID
 */
export function generateTaskId(): string {
  return `tts_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * 创建新任务
 */
export function createTask(taskId: string): TTSTask {
  const task: TTSTask = {
    taskId,
    status: 'pending',
    progress: {
      stage: 'preparing',
      message: '准备中...',
      percentage: 0
    },
    createdAt: Date.now()
  };
  
  taskStore.set(taskId, task);
  return task;
}

/**
 * 获取任务状态
 */
export function getTask(taskId: string): TTSTask | undefined {
  const task = taskStore.get(taskId);
  
  // 检查任务是否过期
  if (task && Date.now() - task.createdAt > TASK_EXPIRY_MS) {
    taskStore.delete(taskId);
    return undefined;
  }
  
  return task;
}

/**
 * 更新任务进度
 */
export function updateTaskProgress(taskId: string, progress: Partial<TTSProgress>): void {
  const task = taskStore.get(taskId);
  if (task) {
    task.progress = { ...task.progress, ...progress };
    task.status = 'processing';
  }
}

/**
 * 更新任务状态（完成或失败）
 */
export function updateTaskStatus(
  taskId: string,
  status: 'completed' | 'failed',
  data?: { url?: string; urls?: string[]; duration?: number; error?: string }
): void {
  const task = taskStore.get(taskId);
  if (task) {
    task.status = status;
    if (status === 'completed') {
      task.progress = {
        stage: 'completed',
        message: '完成',
        percentage: 100
      };
      if (data) {
        task.result = {
          url: data.url,
          urls: data.urls,
          duration: data.duration
        };
      }
    } else if (status === 'failed') {
      task.progress = {
        stage: 'failed',
        message: '生成失败',
        percentage: 0
      };
      task.error = data?.error || 'Unknown error';
    }
  }
}

/**
 * 清理过期任务
 */
export function cleanupExpiredTasks(): void {
  const now = Date.now();
  for (const [taskId, task] of taskStore.entries()) {
    if (now - task.createdAt > TASK_EXPIRY_MS) {
      taskStore.delete(taskId);
    }
  }
}

// 定期清理过期任务（每 5 分钟）
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpiredTasks, 5 * 60 * 1000);
}

