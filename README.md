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
- `dall-e-2` - DALL-E 2
- `dall-e-3` - DALL-E 3
- `dall-e-3-hd` - DALL-E 3 HD quality

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
  -d '{
    "model": "dall-e-3",
    "prompt": "A cute cat",
    "size": "1024x1024"
  }'
```

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

# Image
response = client.images.generate(
    model="dall-e-3",
    prompt="A cute cat",
    size="1024x1024"
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

## Notes

- No API key required (use any value)
- Rate limits depend on upstream service
- Images returned as base64 data URIs
