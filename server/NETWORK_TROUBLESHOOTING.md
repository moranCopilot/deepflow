# 网络连接问题排查指南

如果遇到 "无法连接到 Google API 服务器" 的错误，请按照以下步骤排查：

## 问题症状

- 错误信息：`fetch failed` 或 `timeout`
- 错误代码：HTTP 500
- 错误详情：`Error fetching from https://generativelanguage.googleapis.com/upload/v1beta/files`

## 可能的原因

1. **网络连接问题**：无法访问 Google API 服务器
2. **需要代理**：在中国大陆地区，可能需要配置代理才能访问 Google 服务
3. **防火墙阻止**：公司或本地防火墙可能阻止了连接
4. **API Key 问题**：API Key 可能无效或权限不足

## 解决方案

### 方案 1：检查网络连接

```bash
# 测试是否能访问 Google API
curl -I https://generativelanguage.googleapis.com

# 如果超时，说明网络无法访问
```

### 方案 2：配置代理（如果在中国大陆）

如果你在中国大陆，需要配置代理才能访问 Google API。

#### 方法 A：使用环境变量配置代理

在 `server/.env.local` 文件中添加：

```bash
HTTP_PROXY=http://127.0.0.1:7890
HTTPS_PROXY=http://127.0.0.1:7890
```

（将 `7890` 替换为你的代理端口）

#### 方法 B：使用系统代理

确保你的系统代理已正确配置，Node.js 会自动使用系统代理设置。

### 方案 3：检查 API Key

1. 确认 API Key 是否正确配置在 `server/.env.local` 中
2. 访问 [Google AI Studio](https://makersuite.google.com/app/apikey) 确认 API Key 是否有效
3. 确认 API Key 是否有文件上传权限

### 方案 4：检查防火墙设置

- 确保防火墙允许访问 `generativelanguage.googleapis.com`
- 检查公司网络是否阻止了 Google 服务

## 测试连接

重启后端服务后，尝试上传文件。如果仍有问题，请查看后端日志获取详细错误信息。

## 获取帮助

如果以上方法都无法解决问题，请：
1. 检查后端服务日志（终端输出）
2. 确认网络环境
3. 验证 API Key 有效性

