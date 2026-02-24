# ChatOpenAI.fr API Proxy

OpenAI-compatible API proxy for chatopenai.fr - provides free access to GPT-5.1 chat and DALL-E 3 image generation.

## Features

- **Chat Completions** - GPT-5-nano, GPT-5.1
- **Image Generation** - DALL-E 2, DALL-E 3, DALL-E 3 HD
- **Streaming Support** - Real-time streaming responses
- **OpenAI Compatible** - Works with any OpenAI SDK/client

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/models` | GET | List available models |
| `/v1/chat/completions` | POST | Chat completions |
| `/v1/images/generations` | POST | Image generation |

## Models

### Chat
- `gpt-5-nano` - Fast, lightweight model
- `gpt-5.1` / `gpt-5` - Full capability model

### Images
- `dall-e-2` - DALL-E 2 (256x256, 512x512, 1024x1024)
- `dall-e-3` - DALL-E 3 (1024x1024, 1792x1024, 1024x1792)
- `dall-e-3-hd` - DALL-E 3 HD quality
- `gpt-image-1` - GPT Image 1 (based on DALL-E 3)
- `gpt-image-1.5` - GPT Image 1.5 with enhanced features:
  - Larger sizes: 2048x2048, 2048x1536, 1536x2048
  - Default HD quality
  - Default vivid style
  - Enhanced detail mode

## Web UI Features

The built-in Web UI provides a user-friendly interface with:

- **Bilingual Interface**: Toggle between 繁體中文 and English
- **Settings Panel**: Save API Key and default model preferences
- **Real-time Chat**: Streaming responses with GPT-5.1
- **Image Generation**: Support for multiple images, various sizes and styles
- **Local Storage**: Settings are saved locally for convenience

## Usage

### Chat Example
```bash
curl http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.1",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'
```

### Image Example
```bash
curl http://localhost:8787/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "dall-e-3",
    "prompt": "A cute cat",
    "size": "1024x1024",
    "quality": "standard",
    "style": "natural",
    "output_format": "jpeg",
    "background": "auto"
  }'
```

#### Image Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `model` | string | `dall-e-3` | Model ID: `dall-e-2`, `dall-e-3`, `dall-e-3-hd`, `gpt-image-1`, `gpt-image-1.5` |
| `prompt` | string | required | Image description |
| `size` | string | `1024x1024` | Image size. DALL-E 3: `1024x1024`, `1792x1024`, `1024x1792`. DALL-E 2: `256x256`, `512x512`, `1024x1024` |
| `quality` | string | `standard` | Image quality: `standard`, `hd` |
| `style` | string | `natural` | Image style: `natural`, `vivid` |
| `n` | integer | `1` | Number of images (1-4) |
| `response_format` | string | `url` | Response format: `url`, `b64_json` |
| `output_format` | string | `jpeg` | Output format: `jpeg`, `png`, `webp` |
| `background` | string | `auto` | Background: `auto`, `transparent`, `opaque` |
| `art_style` | string | `None` | Art style preset |
| `artist` | string | `None` | Artist style |
| `photography_style` | string | `None` | Photography style |
| `lighting` | string | `None` | Lighting effect |
| `subject` | string | `None` | Subject focus |
| `camera_settings` | string | `None` | Camera settings |
| `composition` | string | `None` | Composition style |
| `resolution` | string | `None` | Resolution preset |
| `color` | string | `None` | Color scheme |
| `special_effects` | string | `None` | Special effects |

### Python (OpenAI SDK)
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8787/v1",
    api_key="anything"
)

# Chat
response = client.chat.completions.create(
    model="gpt-5.1",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)

# Image with all parameters
response = client.images.generate(
    model="dall-e-3",
    prompt="A cute cat",
    size="1024x1024",
    quality="standard",
    style="natural"
)
print(response.data[0].url)

# Image with extended parameters (using extra_body)
response = client.images.generate(
    model="dall-e-3",
    prompt="A cute cat in cyberpunk style",
    size="1024x1024",
    quality="hd",
    style="vivid",
    extra_body={
        "output_format": "png",
        "background": "transparent",
        "art_style": "Cyberpunk",
        "lighting": "Neon"
    }
)
print(response.data[0].url)
```

## Deploy

```bash
# Local development
npx wrangler dev

# Deploy to Cloudflare
npx wrangler deploy
```

## API Key Configuration

This proxy supports optional API key authentication for securing your deployment.

### Setting Up API Key

**Method 1: Using Wrangler CLI (Recommended)**
```bash
npx wrangler secret put API_KEY
```

**Method 2: Cloudflare Dashboard**
1. Go to Workers > Your Worker > Settings > Variables
2. Add a new secret variable named `API_KEY`
3. Set your desired API key value

### Using API Key

When `API_KEY` is configured, include it in the `Authorization` header:
```bash
curl http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "gpt-5.1",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Python with API Key
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8787/v1",
    api_key="YOUR_API_KEY"  # Use your actual API key
)
```

> **Note**: If `API_KEY` is not configured, the API will not require authentication (backward compatible).

## Notes

- API key authentication is optional (configure via `API_KEY` secret)
- Rate limits depend on upstream service
- Images returned as base64 data URIs

---

# 中文文檔

ChatOpenAI.fr API 代理 - OpenAI 相容的 API 代理服務，提供免費存取 GPT-5.1 聊天和 DALL-E 3 圖片生成功能。

## 功能特色

- **聊天對話** - GPT-5-nano, GPT-5.1
- **圖片生成** - DALL-E 2, DALL-E 3, DALL-E 3 HD
- **串流支援** - 即時串流回應
- **OpenAI 相容** - 可與任何 OpenAI SDK/客戶端搭配使用

## API 端點

| 端點 | 方法 | 說明 |
|------|------|------|
| `/v1/models` | GET | 列出可用模型 |
| `/v1/chat/completions` | POST | 聊天對話 |
| `/v1/images/generations` | POST | 圖片生成 |

## 模型

### 聊天模型
- `gpt-5-nano` - 快速、輕量級模型
- `gpt-5.1` / `gpt-5` - 完整功能模型

### 圖片模型
- `dall-e-2` - DALL-E 2 (256x256, 512x512, 1024x1024)
- `dall-e-3` - DALL-E 3 (1024x1024, 1792x1024, 1024x1792)
- `dall-e-3-hd` - DALL-E 3 高畫質
- `gpt-image-1` - GPT Image 1 (基於 DALL-E 3)
- `gpt-image-1.5` - GPT Image 1.5 增強版功能：
  - 更大尺寸：2048x2048, 2048x1536, 1536x2048
  - 預設 HD 高畫質
  - 預設 vivid 生動風格
  - 增強細節模式

## Web UI 功能特色

內建的 Web UI 提供友善的使用者介面：

- **雙語介面**：支援繁體中文和英文切換
- **設置面板**：儲存 API Key 和預設模型偏好
- **即時聊天**：GPT-5.1 串流回應
- **圖片生成**：支援多張圖片、多種尺寸和風格
- **本地儲存**：設定自動儲存在瀏覽器中

## 使用方式

### 聊天範例
```bash
curl http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "gpt-5.1",
    "messages": [{"role": "user", "content": "你好！"}],
    "stream": false
  }'
```

### 圖片生成範例
```bash
curl http://localhost:8787/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "dall-e-3",
    "prompt": "一隻可愛的貓",
    "size": "1024x1024",
    "quality": "standard",
    "style": "natural",
    "output_format": "jpeg",
    "background": "auto"
  }'
```

#### 圖片生成參數

| 參數 | 類型 | 預設值 | 說明 |
|------|------|--------|------|
| `model` | string | `dall-e-3` | 模型 ID：`dall-e-2`, `dall-e-3`, `dall-e-3-hd`, `gpt-image-1`, `gpt-image-1.5` |
| `prompt` | string | 必填 | 圖片描述提示詞 |
| `size` | string | `1024x1024` | 圖片尺寸。DALL-E 3: `1024x1024`, `1792x1024`, `1024x1792`。DALL-E 2: `256x256`, `512x512`, `1024x1024` |
| `quality` | string | `standard` | 圖片品質：`standard`, `hd` |
| `style` | string | `natural` | 圖片風格：`natural` (自然), `vivid` (生動) |
| `n` | integer | `1` | 生成圖片數量 (1-4) |
| `response_format` | string | `url` | 回應格式：`url`, `b64_json` |
| `output_format` | string | `jpeg` | 輸出格式：`jpeg`, `png`, `webp` |
| `background` | string | `auto` | 背景設定：`auto`, `transparent` (透明), `opaque` (不透明) |
| `art_style` | string | `None` | 藝術風格預設 |
| `artist` | string | `None` | 藝術家風格 |
| `photography_style` | string | `None` | 攝影風格 |
| `lighting` | string | `None` | 燈光效果 |
| `subject` | string | `None` | 主題設定 |
| `camera_settings` | string | `None` | 相機設定 |
| `composition` | string | `None` | 構圖方式 |
| `resolution` | string | `None` | 解析度預設 |
| `color` | string | `None` | 色彩方案 |
| `special_effects` | string | `None` | 特效設定 |

### Python 範例 (OpenAI SDK)
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8787/v1",
    api_key="YOUR_API_KEY"  # 使用您的 API Key
)

# 聊天
response = client.chat.completions.create(
    model="gpt-5.1",
    messages=[{"role": "user", "content": "你好！"}]
)
print(response.choices[0].message.content)

# 圖片生成（標準參數）
response = client.images.generate(
    model="dall-e-3",
    prompt="一隻可愛的貓",
    size="1024x1024",
    quality="standard",
    style="natural"
)
print(response.data[0].url)

# 圖片生成（擴展參數，使用 extra_body）
response = client.images.generate(
    model="dall-e-3",
    prompt="一隻賽博龐克風格的可愛貓",
    size="1024x1024",
    quality="hd",
    style="vivid",
    extra_body={
        "output_format": "png",
        "background": "transparent",
        "art_style": "Cyberpunk",
        "lighting": "Neon"
    }
)
print(response.data[0].url)
```

## API Key 設定

此代理服務支援選用的 API Key 驗證功能，用於保護您的部署。

### 設定 API Key

**方法一：使用 Wrangler CLI（推薦）**
```bash
npx wrangler secret put API_KEY
```

**方法二：Cloudflare Dashboard**
1. 前往 Workers > 您的 Worker > Settings > Variables
2. 新增一個名為 `API_KEY` 的秘密變數
3. 設定您想要的 API Key 值

### 使用 API Key

當設定了 `API_KEY` 後，請在 `Authorization` 標頭中包含它：
```bash
curl http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "gpt-5.1",
    "messages": [{"role": "user", "content": "你好！"}]
  }'
```

> **注意**：如果未設定 `API_KEY`，API 將不需要驗證（向後兼容）。

## 部署

```bash
# 本地開發
npx wrangler dev

# 部署到 Cloudflare
npx wrangler deploy
```

## 注意事項

- API Key 驗證為選用功能（透過 `API_KEY` 秘密變數設定）
- 速率限制取決於上游服務
- 圖片以 base64 資料 URI 格式返回
