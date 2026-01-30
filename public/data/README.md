# 社区内容配置指南

> UGC 音频文件添加与 JSON 配置说明

---

## 目录结构

```
public/
├── data/
│   ├── community-content.json    # 社区内容配置文件
│   └── README.md                 # 本文档
└── assets/
    └── default-audio/            # 音频文件存放目录
        ├── sleep-meditation.m4a
        ├── relax-music.m4a
        └── tech-news.m4a
```

---

## 添加新内容步骤

### Step 1: 放置音频文件

将你的音频文件放入 `public/assets/default-audio/` 目录：

```bash
cp your-audio.m4a public/assets/default-audio/
```

**支持的格式：** `.m4a`, `.mp3`, `.wav`, `.m3u8`

---

### Step 2: 编辑 community-content.json

在 `public/data/community-content.json` 中添加内容条目。

#### PGC 官方内容示例

```json
{
  "pgc": [
    {
      "id": "pgc-4",
      "title": "你的标题",
      "description": "内容描述...",
      "tags": ["标签1", "标签2"],
      "author": {
        "id": "official",
        "name": "DeepFlow 官方",
        "avatar": "/assets/pgc-avatar.png"
      },
      "items": [
        {
          "id": "pgc-4-item-1",
          "title": "音频标题",
          "duration": "10:00",
          "type": "meditation",
          "scene": "sleep_meditation",
          "audioUrl": "/assets/default-audio/your-audio.m4a",
          "script": null
        }
      ],
      "playCount": 0,
      "likeCount": 0,
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z",
      "isPGC": true
    }
  ]
}
```

#### UGC 用户内容示例

```json
{
  "ugc": [
    {
      "id": "ugc-3",
      "title": "用户创作的标题",
      "description": "用户内容描述...",
      "tags": ["学习", "数学"],
      "author": {
        "id": "u3",
        "name": "作者名称",
        "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=AuthorName"
      },
      "items": [
        {
          "id": "ugc-3-item-1",
          "title": "音频标题",
          "duration": "08:30",
          "type": "insight",
          "scene": "focus",
          "audioUrl": "/assets/default-audio/your-audio.m4a",
          "script": null
        }
      ],
      "playCount": 0,
      "likeCount": 0,
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z",
      "isPGC": false
    }
  ]
}
```

---

## 字段说明

### 顶层字段

| 字段 | 类型 | 必填 | 说明 |
|:-----|:-----|:-----|:-----|
| `id` | string | 是 | 唯一标识，PGC 用 `pgc-N`，UGC 用 `ugc-N` |
| `title` | string | 是 | 列表标题 |
| `description` | string | 是 | 列表描述 |
| `tags` | string[] | 是 | 标签数组，用于搜索 |
| `author` | object | 是 | 作者信息 |
| `items` | array | 是 | 音频条目数组 |
| `playCount` | number | 是 | 播放次数 |
| `likeCount` | number | 是 | 点赞数 |
| `isPGC` | boolean | 是 | 是否为官方内容 |

### Item 字段

| 字段 | 类型 | 必填 | 说明 |
|:-----|:-----|:-----|:-----|
| `id` | string | 是 | 条目唯一 ID |
| `title` | string | 是 | 音频标题 |
| `duration` | string | 是 | 时长，格式 `MM:SS` |
| `type` | string | 是 | 类型：`meditation` / `music` / `insight` / `tech` 等 |
| `scene` | string | 是 | 场景：见下方场景值 |
| `audioUrl` | string | **是** | 音频文件路径 |
| `script` | array/null | 否 | 脚本内容，无则填 `null` |

### 可用的 scene 值

| 值 | 说明 | 颜色 |
|:---|:-----|:-----|
| `sleep_meditation` | 睡前冥想 | 紫色 |
| `home_charge` | 居家充电 | 橙色 |
| `focus` | 专注学习 | 靛蓝 |
| `commute` | 通勤路上 | 蓝色 |
| `qa_memory` | 记忆巩固 | 绿色 |
| `daily_review` | 每日复盘 | 玫瑰 |

---

## 验证步骤

1. 保存 JSON 文件
2. 刷新浏览器页面（无需重新构建）
3. 进入社区页面，检查新内容是否显示
4. 点击卡片进入详情页
5. 点击 "Go Flow" 测试音频播放

---

## 常见问题

### Q: 修改 JSON 后没有生效？
**A:** 尝试硬刷新（Ctrl+Shift+R / Cmd+Shift+R）清除浏览器缓存。

### Q: 音频无法播放？
**A:** 检查以下几点：
- `audioUrl` 路径是否正确
- 音频文件格式是否支持
- 浏览器控制台是否有错误信息

### Q: 如何获取作者头像？
**A:** 可以使用 DiceBear API 生成随机头像：
```
https://api.dicebear.com/7.x/avataaars/svg?seed=任意字符串
```

---

## 快速模板

复制以下模板，替换 `{{ }}` 中的内容：

```json
{
  "id": "{{prefix}}-{{number}}",
  "title": "{{标题}}",
  "description": "{{描述}}",
  "tags": ["{{标签1}}", "{{标签2}}"],
  "author": {
    "id": "{{author-id}}",
    "name": "{{作者名称}}",
    "avatar": "{{头像URL或null}}"
  },
  "items": [
    {
      "id": "{{list-id}}-item-1",
      "title": "{{音频标题}}",
      "duration": "{{MM:SS}}",
      "type": "{{类型}}",
      "scene": "{{场景}}",
      "audioUrl": "/assets/default-audio/{{音频文件名}}",
      "script": null
    }
  ],
  "playCount": 0,
  "likeCount": 0,
  "createdAt": "{{ISO时间}}",
  "updatedAt": "{{ISO时间}}",
  "isPGC": {{true或false}}
}
```
