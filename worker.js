// ChatOpenAI.fr Worker - OpenAI Compatible Proxy
// Proxies requests to chatopenai.fr free AI chat & image generation

const CONFIG = {
  VERSION: "1.0.0",
  BASE_URL: "https://chatopenai.fr",
  AJAX_ENDPOINT: "/wp-admin/admin-ajax.php",
  POST_ID: "2",
  MODELS: {
    // Chat models
    "gpt-5-nano": { botId: "0", type: "chat" },
    "gpt-5.1": { botId: "1048", type: "chat" },
    "gpt-5": { botId: "1048", type: "chat" },
    // Image models
    "dall-e-2": { imgModel: "dall-e-2", type: "image" },
    "dall-e-3": { imgModel: "dall-e-3", type: "image" },
    "dall-e-3-hd": { imgModel: "dall-e-3-hd", type: "image" },
    "gpt-image-1": { imgModel: "dall-e-3", type: "image" },
    "gpt-image-1.5": {
      imgModel: "dall-e-3-hd",
      type: "image",
      // 特殊功能配置 / Special features
      supports: {
        sizes: ["1024x1024", "1792x1024", "1024x1792", "2048x2048", "2048x1536", "1536x2048"],
        maxImages: 4,
        defaultQuality: "hd",
        defaultStyle: "vivid",
        enhancedDetail: true  // 增強細節模式
      }
    }
  },
  DEFAULT_MODEL: "gpt-5.1"
};

let cachedNonce = null;
let cachedImageNonce = null;
let nonceExpiry = 0;

function generateClientId(length = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateChatId() {
  return Math.floor(Math.random() * 90000) + 10000;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}

/**
 * 驗證 API Key / Validate API Key
 * 如果未設定 API_KEY 環境變數，則跳過驗證（向後兼容）
 * If API_KEY environment variable is not set, skip validation (backward compatible)
 */
function validateApiKey(request, env) {
    // 如果沒有設定 API_KEY，跳過驗證（向後兼容）
    // If API_KEY is not set, skip validation (backward compatible)
    if (!env.API_KEY) {
        return null;
    }
    
    const authHeader = request.headers.get('Authorization');
    
    // 檢查 Authorization header 是否存在
    // Check if Authorization header exists
    if (!authHeader) {
        return new Response(JSON.stringify({
            error: "缺少授權標頭 / Missing Authorization header"
        }), {
            status: 401,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders()
            }
        });
    }
    
    // 驗證 Bearer token 格式
    // Validate Bearer token format
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
        return new Response(JSON.stringify({
            error: "無效的授權格式，請使用 Bearer token / Invalid authorization format, please use Bearer token"
        }), {
            status: 401,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders()
            }
        });
    }
    
    const token = match[1];
    
    // 驗證 token 是否正確
    // Validate if token is correct
    if (token !== env.API_KEY) {
        return new Response(JSON.stringify({
            error: "無效的 API Key / Invalid API Key"
        }), {
            status: 401,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders()
            }
        });
    }
    
    // 驗證通過
    // Validation passed
    return null;
}

// Fetch nonces from the page
async function fetchNonces() {
  const now = Date.now();
  if (cachedNonce && cachedImageNonce && now < nonceExpiry) {
    return { chat: cachedNonce, image: cachedImageNonce };
  }

  try {
    const resp = await fetch(CONFIG.BASE_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
      }
    });
    const html = await resp.text();
    
    // Look for wpaicgParams.search_nonce (chat nonce)
    const chatNonceMatch = html.match(/search_nonce['"]\s*:\s*['"]([a-f0-9]+)['"]/i);
    if (chatNonceMatch) {
      cachedNonce = chatNonceMatch[1];
    }
    
    // Look for image nonce - usually in a hidden field or wpaicg image form
    // Pattern: name="_wpnonce" value="xxx" in image generator form
    const imageNonceMatch = html.match(/id=['"]wpaicg-image-generator-form['"][^>]*>[\s\S]*?name=['"]_wpnonce['"][^>]*value=['"]([a-f0-9]+)['"]/i);
    if (imageNonceMatch) {
      cachedImageNonce = imageNonceMatch[1];
    } else {
      // Fallback: look for any _wpnonce near image generator
      const fallbackMatch = html.match(/wpaicg.*?_wpnonce.*?value=['"]([a-f0-9]+)['"]/i) ||
                           html.match(/value=['"]([a-f0-9]+)['"].*?name=['"]_wpnonce['"]/i);
      if (fallbackMatch) {
        cachedImageNonce = fallbackMatch[1];
      } else {
        // Use chat nonce as fallback
        cachedImageNonce = cachedNonce;
      }
    }
    
    nonceExpiry = now + 5 * 60 * 1000; // 5 minutes
    
    if (!cachedNonce) {
      throw new Error("Could not find chat nonce");
    }
    
    console.log("Fetched nonces - chat:", cachedNonce, "image:", cachedImageNonce);
    return { chat: cachedNonce, image: cachedImageNonce };
  } catch (e) {
    console.error("Nonce fetch error:", e);
    throw e;
  }
}

async function getNonce() {
  const nonces = await fetchNonces();
  return nonces.chat;
}

async function getImageNonce() {
  const nonces = await fetchNonces();
  return nonces.image;
}

function formatMessages(messages) {
  const history = [];
  let currentMessage = "";
  
  for (const msg of messages) {
    if (msg.role === "user") {
      currentMessage = msg.content;
    } else if (msg.role === "assistant") {
      history.push({ id: generateChatId(), text: "AI: " + msg.content });
    } else if (msg.role === "system") {
      history.push({ id: "", text: "Human: [System] " + msg.content });
    }
  }
  
  // Get the last user message
  const lastUser = messages.filter(m => m.role === "user").pop();
  return {
    message: lastUser?.content || "",
    history: history.slice(-10) // Keep last 10 messages for context
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname === "/favicon.ico") {
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
        return handleWebUI();
    }

    // 驗證 API Key（僅對 API 端點）
    // Validate API Key (only for API endpoints)
    const authError = validateApiKey(request, env);
    if (authError) {
        return authError;
    }

    if (url.pathname === "/v1/models") {
        return handleModels();
    }

    if (url.pathname === "/v1/chat/completions") {
        return handleChat(request);
    }

    if (url.pathname === "/v1/images/generations") {
        return handleImageGeneration(request);
    }

    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { ...corsHeaders(), "Content-Type": "application/json" }
    });
  }
};

function handleModels() {
  const models = Object.keys(CONFIG.MODELS).map(id => ({
    id,
    object: "model",
    owned_by: "chatopenai",
    type: CONFIG.MODELS[id].type
  }));
  return new Response(JSON.stringify({ object: "list", data: models }), {
    headers: { ...corsHeaders(), "Content-Type": "application/json" }
  });
}

async function handleChat(request) {
  try {
    const body = await request.json();
    const messages = body.messages || [];
    const stream = body.stream === true;
    const model = body.model || CONFIG.DEFAULT_MODEL;
    
    const modelConfig = CONFIG.MODELS[model] || CONFIG.MODELS[CONFIG.DEFAULT_MODEL];
    if (modelConfig.type !== "chat") {
      return new Response(JSON.stringify({ error: "Model is not a chat model" }), {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" }
      });
    }

    const nonce = await getNonce();
    const { message, history } = formatMessages(messages);
    const clientId = generateClientId();
    const chatId = generateChatId();
    
    const botId = modelConfig.botId;
    const chatbotIdentity = botId === "0" ? "shortcode" : `custom_bot_${botId}`;

    const formBody = new URLSearchParams({
      "_wpnonce": nonce,
      "post_id": CONFIG.POST_ID,
      "url": CONFIG.BASE_URL,
      "action": "wpaicg_chat_shortcode_message",
      "message": message,
      "bot_id": botId,
      "chatbot_identity": chatbotIdentity,
      "wpaicg_chat_history": JSON.stringify(history),
      "wpaicg_chat_client_id": clientId,
      "chat_id": chatId.toString()
    });

    const upstreamResp = await fetch(`${CONFIG.BASE_URL}${CONFIG.AJAX_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Origin": CONFIG.BASE_URL,
        "Referer": CONFIG.BASE_URL + "/"
      },
      body: formBody.toString()
    });

    if (!upstreamResp.ok) {
      // Nonce might be expired, clear and retry
      cachedNonce = null;
      nonceExpiry = 0;
      
      const newNonce = await getNonce();
      formBody.set("_wpnonce", newNonce);
      
      const retryResp = await fetch(`${CONFIG.BASE_URL}${CONFIG.AJAX_ENDPOINT}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Origin": CONFIG.BASE_URL,
          "Referer": CONFIG.BASE_URL + "/"
        },
        body: formBody.toString()
      });
      
      return processStreamResponse(retryResp, stream, model);
    }

    return processStreamResponse(upstreamResp, stream, model);

  } catch (e) {
    console.error("Chat error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" }
    });
  }
}

async function processStreamResponse(response, stream, model) {
  const text = await response.text();
  
  // Parse SSE response and extract content
  let fullContent = "";
  const lines = text.split("\n");
  
  for (const line of lines) {
    if (line.startsWith("data: ") && line !== "data: [DONE]") {
      try {
        const data = JSON.parse(line.slice(6));
        if (data.choices?.[0]?.delta?.content) {
          fullContent += data.choices[0].delta.content;
        }
      } catch (e) {}
    }
  }

  if (!fullContent) {
    return new Response(JSON.stringify({ error: "No response from upstream" }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" }
    });
  }

  const completionId = `chatcmpl-${generateClientId(29)}`;

  if (stream) {
    // Re-stream the response in OpenAI format
    return streamResponse(fullContent, completionId, model);
  }

  return new Response(JSON.stringify({
    id: completionId,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: { role: "assistant", content: fullContent },
      finish_reason: "stop"
    }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  }), {
    headers: { ...corsHeaders(), "Content-Type": "application/json" }
  });
}

function streamResponse(content, completionId, model) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      // Role chunk
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        id: completionId,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }]
      })}\n\n`));

      // Content chunks
      const chunkSize = 4;
      for (let i = 0; i < content.length; i += chunkSize) {
        const chunk = content.slice(i, i + chunkSize);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          id: completionId,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }]
        })}\n\n`));
        await new Promise(r => setTimeout(r, 10));
      }

      // Final chunk
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        id: completionId,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }]
      })}\n\n`));

      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders(),
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache"
    }
  });
}


async function handleImageGeneration(request) {
  try {
    const body = await request.json();
    const prompt = body.prompt || "";
    const model = body.model || "dall-e-3";
    const size = body.size || "1024x1024";
    let quality = body.quality || "standard";
    const n = body.n || 1;
    
    // OpenAI 標準參數 / OpenAI Standard Parameters
    let style = body.style || "natural";  // "vivid" | "natural"
    const responseFormat = body.response_format || "url";  // "url" | "b64_json"
    
    // 擴展參數 / Extended Parameters
    const outputFormat = body.output_format || "jpeg";  // "jpeg" | "png" | "webp"
    const background = body.background || "auto";  // "auto" | "transparent" | "opaque"
    const artStyle = body.art_style || "None";
    const artist = body.artist || "None";
    const photographyStyle = body.photography_style || "None";
    const lighting = body.lighting || "None";
    const subject = body.subject || "None";
    const cameraSettings = body.camera_settings || "None";
    const composition = body.composition || "None";
    const resolution = body.resolution || "None";
    const color = body.color || "None";
    const specialEffects = body.special_effects || "None";

    const modelConfig = CONFIG.MODELS[model] || CONFIG.MODELS["dall-e-3"];
    if (modelConfig.type !== "image") {
      return new Response(JSON.stringify({ error: "Model is not an image model" }), {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" }
      });
    }

    // 檢查模型是否有特殊配置 (gpt-image-1.5)
    // Check if model has special configuration
    const hasSpecialConfig = modelConfig.supports !== undefined;
    
    // 應用模型預設值 / Apply model defaults
    if (hasSpecialConfig) {
      // 使用模型預設的 quality 和 style
      if (modelConfig.supports.defaultQuality && quality === "standard") {
        quality = modelConfig.supports.defaultQuality;
      }
      if (modelConfig.supports.defaultStyle && style === "natural") {
        style = modelConfig.supports.defaultStyle;
      }
    }

    const nonce = await getImageNonce();

    // Map size to supported sizes
    // DALL-E 3 supports: 1024x1024, 1792x1024 (landscape), 1024x1792 (portrait)
    // DALL-E 2 supports: 256x256, 512x512, 1024x1024
    // gpt-image-1.5 supports larger sizes: 2048x2048, 2048x1536, 1536x2048
    let imgSize = "1024x1024";
    if (size === "1024x1792" || size === "1024x1536") {
      imgSize = "1024x1792";  // Portrait
    } else if (size === "1792x1024" || size === "1536x1024") {
      imgSize = "1792x1024";  // Landscape
    } else if (size === "256x256" || size === "512x512") {
      imgSize = size;  // DALL-E 2 small sizes
    } else if (hasSpecialConfig && modelConfig.supports.sizes.includes(size)) {
      // gpt-image-1.5 支援更大的尺寸
      imgSize = size;
    }

    // Map style to img_type (vivid -> vivid, natural -> natural)
    const imgType = style === "vivid" ? "vivid" : "natural";

    const formBody = new URLSearchParams({
      "_wpnonce": nonce,
      "action": "wpaicg_image_generator",
      "prompt": prompt,
      "img_model": modelConfig.imgModel,
      "img_size": imgSize,
      "img_type": imgType,
      "num_images": Math.min(n, 4).toString(),
      "size": "auto",
      "quality": quality === "hd" ? "high" : "low",
      "output_format": outputFormat,
      "background": background,
      "artist": artist,
      "art_style": artStyle,
      "photography_style": photographyStyle,
      "lighting": lighting,
      "subject": subject,
      "camera_settings": cameraSettings,
      "composition": composition,
      "resolution": resolution,
      "color": color,
      "special_effects": specialEffects
    });

    console.log("Image request - nonce:", nonce, "model:", modelConfig.imgModel, "prompt:", prompt.substring(0, 50));

    const upstreamResp = await fetch(`${CONFIG.BASE_URL}${CONFIG.AJAX_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Origin": CONFIG.BASE_URL,
        "Referer": CONFIG.BASE_URL + "/"
      },
      body: formBody.toString()
    });

    const responseText = await upstreamResp.text();
    console.log("Image response:", responseText.substring(0, 500));

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      // Nonce might be expired, clear cache and retry
      cachedImageNonce = null;
      nonceExpiry = 0;
      
      const newNonce = await getImageNonce();
      formBody.set("_wpnonce", newNonce);
      
      const retryResp = await fetch(`${CONFIG.BASE_URL}${CONFIG.AJAX_ENDPOINT}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Origin": CONFIG.BASE_URL,
          "Referer": CONFIG.BASE_URL + "/"
        },
        body: formBody.toString()
      });
      
      result = await retryResp.json();
    }

    if (result.status !== "success") {
      // Check if it's a nonce error
      if (result.msg?.includes("nonce") || result.msg?.includes("Nonce") || responseText === "0" || responseText === "-1") {
        return new Response(JSON.stringify({ 
          error: "Nonce verification failed - try refreshing the source page",
          details: result.msg || responseText
        }), {
          status: 401,
          headers: { ...corsHeaders(), "Content-Type": "application/json" }
        });
      }
      
      return new Response(JSON.stringify({ 
        error: result.msg || "Image generation failed" 
      }), {
        status: 500,
        headers: { ...corsHeaders(), "Content-Type": "application/json" }
      });
    }

    // Format response in OpenAI format
    // The response has "imgs" array with base64 data URIs
    let data = [];
    const imgs = result.imgs || result.images || [];
    
    console.log("Processing imgs:", imgs.length, "items", "format:", responseFormat);
    
    if (Array.isArray(imgs) && imgs.length > 0) {
      data = imgs.map(img => {
        // img is a data URI like "data:image/jpeg;base64,..."
        if (typeof img === 'string') {
          if (img.startsWith('data:image')) {
            // Extract base64 data from data URI
            const base64Data = img.split(',')[1];
            
            if (responseFormat === "b64_json") {
              // Return base64 encoded data
              return {
                b64_json: base64Data,
                revised_prompt: prompt
              };
            } else {
              // Return as URL (data URI)
              return {
                url: img,
                revised_prompt: prompt
              };
            }
          }
          // It's a regular URL
          if (responseFormat === "b64_json") {
            // Cannot convert URL to base64, return as is with warning
            return { url: img, revised_prompt: prompt };
          }
          return { url: img, revised_prompt: prompt };
        }
        // If it's an object
        return {
          url: img.url || null,
          b64_json: img.b64_json || null,
          revised_prompt: prompt
        };
      });
    } else if (result.url) {
      data = [{ url: result.url, revised_prompt: prompt }];
    } else if (result.data) {
      data = result.data;
    }
    
    console.log("Returning data:", data.length, "images");

    return new Response(JSON.stringify({
      created: Math.floor(Date.now() / 1000),
      data
    }), {
      headers: { ...corsHeaders(), "Content-Type": "application/json" }
    });

  } catch (e) {
    console.error("Image generation error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" }
    });
  }
}

function handleWebUI() {
  const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ChatOpenAI.fr API (v${CONFIG.VERSION})</title>
  <style>
    :root { --bg: #0d1117; --panel: #161b22; --text: #c9d1d9; --accent: #10b981; --border: #30363d; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft JhengHei", "微軟正黑體", sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 40px 20px; }
    .container { max-width: 800px; width: 100%; }
    h1 { color: var(--accent); margin-bottom: 10px; }
    .badge { background: var(--accent); color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-left: 10px; }
    .card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 20px; margin: 20px 0; }
    .label { font-size: 12px; color: #8b949e; margin-bottom: 5px; }
    input, textarea, select { width: 100%; background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 10px; border-radius: 4px; font-family: monospace; margin-bottom: 10px; }
    button { background: var(--accent); color: #fff; border: none; padding: 12px 24px; border-radius: 4px; cursor: pointer; font-weight: bold; width: 100%; }
    button:hover { opacity: 0.9; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    button.secondary { background: var(--panel); border: 1px solid var(--border); }
    button.secondary:hover { background: var(--border); }
    .output { background: #000; border-radius: 4px; padding: 15px; margin-top: 20px; white-space: pre-wrap; font-family: monospace; font-size: 13px; max-height: 400px; overflow-y: auto; }
    .tabs { display: flex; gap: 10px; margin-bottom: 15px; }
    .tab { padding: 8px 16px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; }
    .tab.active { background: var(--accent); border-color: var(--accent); }
    .img-result { max-width: 100%; border-radius: 8px; margin-top: 10px; }
    .info { font-size: 12px; color: #6e7681; margin-top: 10px; }
    .settings-panel { display: none; }
    .settings-panel.active { display: block; }
    .header-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .lang-selector { display: flex; gap: 5px; }
    .lang-btn { padding: 5px 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; font-size: 12px; }
    .lang-btn.active { background: var(--accent); border-color: var(--accent); }
    .save-indicator { color: var(--accent); font-size: 12px; margin-left: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-bar">
      <h1>ChatOpenAI.fr API <span class="badge">v${CONFIG.VERSION}</span></h1>
      <div class="lang-selector">
        <button class="lang-btn active" onclick="setLang('zh')" id="lang-zh">中文</button>
        <button class="lang-btn" onclick="setLang('en')" id="lang-en">EN</button>
      </div>
    </div>
    <p style="color: #8b949e;" data-i18n="subtitle">OpenAI 相容 API 代理服務（聊天 + 圖片生成）</p>
    
    <!-- 介紹區塊 / Introduction -->
    <div class="card" style="background: linear-gradient(135deg, var(--panel) 0%, #1a2332 100%);">
      <div style="display: flex; align-items: flex-start; gap: 15px;">
        <div style="font-size: 40px;">🤖</div>
        <div>
          <h3 style="margin: 0 0 10px 0; color: var(--accent);" data-i18n="introTitle">歡迎使用 ChatOpenAI.fr API 代理</h3>
          <p style="margin: 0; color: #8b949e; line-height: 1.6;" data-i18n="introText">
            本服務提供 OpenAI 相容的 API 介面，讓您可以免費使用 GPT-5.1 進行聊天對話，以及使用 DALL-E 3 生成高品質圖片。
            支援串流回應、多張圖片生成、多種尺寸和風格選擇。
          </p>
          <div style="margin-top: 15px; display: flex; gap: 15px; flex-wrap: wrap;">
            <span style="background: var(--bg); padding: 5px 12px; border-radius: 20px; font-size: 12px;">💬 GPT-5.1 聊天</span>
            <span style="background: var(--bg); padding: 5px 12px; border-radius: 20px; font-size: 12px;">🎨 DALL-E 3 圖片生成</span>
            <span style="background: var(--bg); padding: 5px 12px; border-radius: 20px; font-size: 12px;">⚡ 即時串流回應</span>
            <span style="background: var(--bg); padding: 5px 12px; border-radius: 20px; font-size: 12px;">🔑 API Key 驗證</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 設置面板 -->
    <div class="card">
      <div class="tabs">
        <div class="tab active" onclick="switchSettingsTab('connection')" data-i18n-tab="connection">🔌 連線設定</div>
        <div class="tab" onclick="switchSettingsTab('defaults')" data-i18n-tab="defaults">⚙️ 預設值</div>
      </div>
      
      <div id="settings-connection" class="settings-panel active">
        <div class="label" data-i18n="apiEndpoint">API 端點 / API Endpoint</div>
        <input type="text" id="apiUrl" readonly onclick="this.select()">
        <div class="label" data-i18n="apiKey">API 金鑰 / API Key（選填）</div>
        <input type="password" id="apiKey" placeholder="輸入 API Key 如果需要驗證 / Enter API Key if required">
        <button onclick="saveSettings()" class="secondary" data-i18n="save">💾 儲存設定</button>
        <span class="save-indicator" id="save-indicator" style="display:none;">✓ 已儲存</span>
      </div>
      
      <div id="settings-defaults" class="settings-panel">
        <div class="label" data-i18n="defaultChatModel">預設聊天模型 / Default Chat Model</div>
        <select id="default-chat-model">
          <option value="gpt-5.1">GPT-5.1</option>
          <option value="gpt-5-nano">GPT-5 Nano</option>
        </select>
        <div class="label" data-i18n="defaultImageModel">預設圖片模型 / Default Image Model</div>
        <select id="default-image-model">
          <option value="dall-e-3">DALL-E 3</option>
          <option value="dall-e-3-hd">DALL-E 3 HD</option>
          <option value="dall-e-2">DALL-E 2</option>
          <option value="gpt-image-1">GPT-Image-1</option>
          <option value="gpt-image-1.5" selected>GPT-Image-1.5</option>
        </select>
        <button onclick="saveSettings()" class="secondary" data-i18n="save">💾 儲存設定</button>
        <span class="save-indicator" id="save-indicator2" style="display:none;">✓ 已儲存</span>
      </div>
    </div>
    
    <div class="card">
      <div class="tabs">
        <div class="tab active" onclick="switchTab('chat')" data-i18n-tab="chat">💬 聊天</div>
        <div class="tab" onclick="switchTab('image')" data-i18n-tab="image">🎨 圖片生成</div>
      </div>
      
      <div id="chat-panel">
        <div class="label" data-i18n="chatModel">聊天模型 / Chat Model</div>
        <select id="chat-model">
          <option value="gpt-5.1">GPT-5.1</option>
          <option value="gpt-5-nano">GPT-5 Nano</option>
        </select>
        <div class="label" data-i18n="message">訊息 / Message</div>
        <textarea id="prompt" rows="3" data-i18n-placeholder="chatPlaceholder">你好，請簡短介紹自己。</textarea>
        <button onclick="sendChat()" data-i18n="send">發送訊息 / Send</button>
      </div>
      
      <div id="image-panel" style="display:none;">
        <div class="label" data-i18n="imageModel">圖片模型 / Image Model</div>
        <select id="img-model">
          <option value="dall-e-3">DALL-E 3</option>
          <option value="dall-e-3-hd">DALL-E 3 HD</option>
          <option value="dall-e-2">DALL-E 2</option>
          <option value="gpt-image-1">GPT-Image-1</option>
          <option value="gpt-image-1.5" selected>GPT-Image-1.5</option>
        </select>
        <div class="label" data-i18n="size">尺寸 / Size</div>
        <select id="img-size">
          <option value="1024x1024" selected>1024x1024（正方形 - 所有模型）</option>
          <option value="1792x1024">1792x1024（橫向 - DALL-E 3）</option>
          <option value="1024x1792">1024x1792（直向 - DALL-E 3）</option>
          <option value="2048x2048">2048x2048（大正方形 - GPT-Image-1.5）</option>
          <option value="2048x1536">2048x1536（大橫向 - GPT-Image-1.5）</option>
          <option value="1536x2048">1536x2048（大直向 - GPT-Image-1.5）</option>
          <option value="512x512">512x512（僅 DALL-E 2）</option>
          <option value="256x256">256x256（僅 DALL-E 2）</option>
        </select>
        <div class="label" data-i18n="style">風格 / Style</div>
        <select id="img-style">
          <option value="natural" selected>自然 / Natural</option>
          <option value="vivid">生動 / Vivid</option>
        </select>
        <div class="label" data-i18n="quality">品質 / Quality</div>
        <select id="img-quality">
          <option value="standard" selected>標準 / Standard</option>
          <option value="hd">高畫質 / HD</option>
        </select>
        <div class="label" data-i18n="outputFormat">輸出格式 / Output Format</div>
        <select id="img-output-format">
          <option value="jpeg" selected>JPEG</option>
          <option value="png">PNG</option>
          <option value="webp">WebP</option>
        </select>
        <div class="label" data-i18n="background">背景 / Background</div>
        <select id="img-background">
          <option value="auto" selected>自動 / Auto</option>
          <option value="transparent">透明 / Transparent</option>
          <option value="opaque">不透明 / Opaque</option>
        </select>
        <div class="label" data-i18n="numImages">圖片數量 / Number of Images</div>
        <select id="img-n">
          <option value="1" selected>1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
        </select>
        <div class="label" data-i18n="prompt">提示詞 / Prompt</div>
        <textarea id="img-prompt" rows="3" data-i18n-placeholder="imagePlaceholder">一隻可愛的橘貓坐在窗台上，數位藝術風格</textarea>
        <button onclick="generateImage()" data-i18n="generate">生成圖片 / Generate</button>
      </div>
    </div>
    
    <div class="output" id="output" data-i18n="ready">準備就緒...</div>
    <div id="img-container"></div>
  </div>
  <script>
    // 語言設定 / Language settings
    const i18n = {
      zh: {
        subtitle: 'OpenAI 相容 API 代理服務（聊天 + 圖片生成）',
        introTitle: '歡迎使用 ChatOpenAI.fr API 代理',
        introText: '本服務提供 OpenAI 相容的 API 介面，讓您可以免費使用 GPT-5.1 進行聊天對話，以及使用 DALL-E 3 生成高品質圖片。支援串流回應、多張圖片生成、多種尺寸和風格選擇。',
        connection: '🔌 連線設定',
        defaults: '⚙️ 預設值',
        apiEndpoint: 'API 端點',
        apiKey: 'API 金鑰（選填）',
        save: '💾 儲存設定',
        saved: '✓ 已儲存',
        defaultChatModel: '預設聊天模型',
        defaultImageModel: '預設圖片模型',
        chat: '💬 聊天',
        image: '🎨 圖片生成',
        chatModel: '聊天模型',
        message: '訊息',
        send: '發送訊息',
        chatPlaceholder: '你好，請簡短介紹自己。',
        imageModel: '圖片模型',
        size: '尺寸',
        style: '風格',
        quality: '品質',
        outputFormat: '輸出格式',
        background: '背景',
        numImages: '圖片數量',
        prompt: '提示詞',
        generate: '生成圖片',
        imagePlaceholder: '一隻可愛的橘貓坐在窗台上，數位藝術風格',
        ready: '準備就緒...',
        sending: '正在發送...',
        generating: '正在生成',
        image_s: '張圖片',
        with_model: '使用模型',
        generated: '圖片生成成功！',
        error: '錯誤',
        noImageData: '沒有圖片資料'
      },
      en: {
        subtitle: 'OpenAI-compatible API proxy (Chat + Images)',
        introTitle: 'Welcome to ChatOpenAI.fr API Proxy',
        introText: 'This service provides an OpenAI-compatible API interface, allowing you to use GPT-5.1 for chat conversations and DALL-E 3 for high-quality image generation for free. Supports streaming responses, multiple image generation, various sizes and styles.',
        connection: '🔌 Connection',
        defaults: '⚙️ Defaults',
        apiEndpoint: 'API Endpoint',
        apiKey: 'API Key (optional)',
        save: '💾 Save Settings',
        saved: '✓ Saved',
        defaultChatModel: 'Default Chat Model',
        defaultImageModel: 'Default Image Model',
        chat: '💬 Chat',
        image: '🎨 Image',
        chatModel: 'Chat Model',
        message: 'Message',
        send: 'Send Message',
        chatPlaceholder: 'Hello, please introduce yourself briefly.',
        imageModel: 'Image Model',
        size: 'Size',
        style: 'Style',
        quality: 'Quality',
        outputFormat: 'Output Format',
        background: 'Background',
        numImages: 'Number of Images',
        prompt: 'Prompt',
        generate: 'Generate Image(s)',
        imagePlaceholder: 'A cute orange cat sitting on a windowsill, digital art',
        ready: 'Ready...',
        sending: 'Sending to',
        generating: 'Generating',
        image_s: 'image(s)',
        with_model: 'with',
        generated: 'image(s) generated successfully!',
        error: 'Error',
        noImageData: 'No image data in response'
      }
    };
    
    let currentLang = 'zh';
    
    // 載入設定 / Load settings
    function loadSettings() {
      const saved = JSON.parse(localStorage.getItem('chatopenai_settings') || '{}');
      if (saved.lang) {
        currentLang = saved.lang;
        setLang(currentLang, false);
      }
      if (saved.apiKey) {
        document.getElementById('apiKey').value = saved.apiKey;
      }
      if (saved.defaultChatModel) {
        document.getElementById('default-chat-model').value = saved.defaultChatModel;
        document.getElementById('chat-model').value = saved.defaultChatModel;
      }
      if (saved.defaultImageModel) {
        document.getElementById('default-image-model').value = saved.defaultImageModel;
        document.getElementById('img-model').value = saved.defaultImageModel;
      }
    }
    
    // 儲存設定 / Save settings
    function saveSettings() {
      const settings = {
        lang: currentLang,
        apiKey: document.getElementById('apiKey').value,
        defaultChatModel: document.getElementById('default-chat-model').value,
        defaultImageModel: document.getElementById('default-image-model').value
      };
      localStorage.setItem('chatopenai_settings', JSON.stringify(settings));
      
      // 應用預設模型
      document.getElementById('chat-model').value = settings.defaultChatModel;
      document.getElementById('img-model').value = settings.defaultImageModel;
      
      // 顯示儲存指示器
      const indicator = document.getElementById('save-indicator') || document.getElementById('save-indicator2');
      if (indicator) {
        indicator.style.display = 'inline';
        setTimeout(() => indicator.style.display = 'none', 2000);
      }
    }
    
    // 切換語言 / Switch language
    function setLang(lang, save = true) {
      currentLang = lang;
      document.querySelectorAll('.lang-btn').forEach(btn => btn.classList.remove('active'));
      document.getElementById('lang-' + lang).classList.add('active');
      
      // 更新所有帶有 data-i18n 屬性的元素
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (i18n[lang][key]) {
          el.textContent = i18n[lang][key];
        }
      });
      
      // 更新佔位符
      document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (i18n[lang][key]) {
          el.placeholder = i18n[lang][key];
        }
      });
      
      // 更新輸出區域
      const output = document.getElementById('output');
      if (output && output.textContent === i18n['zh'].ready || output.textContent === i18n['en'].ready) {
        output.textContent = i18n[lang].ready;
      }
      
      if (save) saveSettings();
    }
    
    // 切換設置標籤 / Switch settings tab
    function switchSettingsTab(tab) {
      document.querySelectorAll('#settings-connection, #settings-defaults').forEach(p => p.classList.remove('active'));
      document.getElementById('settings-' + tab).classList.add('active');
      document.querySelectorAll('.tab').forEach(t => {
        if (t.onclick && t.onclick.toString().includes('switchSettingsTab')) {
          t.classList.remove('active');
        }
      });
      event.target.classList.add('active');
    }
    
    // 初始化
    document.getElementById('apiUrl').value = location.origin + '/v1';
    loadSettings();
    
    function switchTab(tab) {
      document.querySelectorAll('.tab').forEach(t => {
        if (t.onclick && t.onclick.toString().includes('switchTab')) {
          t.classList.remove('active');
        }
      });
      event.target.classList.add('active');
      document.getElementById('chat-panel').style.display = tab === 'chat' ? 'block' : 'none';
      document.getElementById('image-panel').style.display = tab === 'image' ? 'block' : 'none';
      document.getElementById('img-container').innerHTML = '';
    }
    
    async function sendChat() {
      const output = document.getElementById('output');
      const prompt = document.getElementById('prompt').value;
      const model = document.getElementById('chat-model').value;
      const apiKey = document.getElementById('apiKey').value;
      const t = i18n[currentLang];
      output.textContent = t.sending + ' ' + model + '...';
      
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) {
          headers['Authorization'] = 'Bearer ' + apiKey;
        }
        
        const response = await fetch('/v1/chat/completions', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: true })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          output.textContent = t.error + ': ' + errorText;
          return;
        }
        
        output.textContent = '';
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\\n');
          buffer = lines.pop();
          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.choices?.[0]?.delta?.content) {
                  output.textContent += data.choices[0].delta.content;
                }
              } catch {}
            }
          }
        }
      } catch (e) {
        output.textContent = 'Error: ' + e.message;
      }
    }
    
    async function generateImage() {
      const output = document.getElementById('output');
      const container = document.getElementById('img-container');
      const prompt = document.getElementById('img-prompt').value;
      const model = document.getElementById('img-model').value;
      const size = document.getElementById('img-size').value;
      const style = document.getElementById('img-style').value;
      const quality = document.getElementById('img-quality').value;
      const outputFormat = document.getElementById('img-output-format').value;
      const background = document.getElementById('img-background').value;
      const n = parseInt(document.getElementById('img-n').value) || 1;
      const apiKey = document.getElementById('apiKey').value;
      const t = i18n[currentLang];
      
      output.textContent = t.generating + ' ' + n + ' ' + t.image_s + ' ' + t.with_model + ' ' + model + ' (' + style + ', ' + quality + ')...';
      container.innerHTML = '';
      
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) {
          headers['Authorization'] = 'Bearer ' + apiKey;
        }
        
        const response = await fetch('/v1/images/generations', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            model,
            prompt,
            size,
            n,
            style,
            quality,
            output_format: outputFormat,
            background
          })
        });
        
        const result = await response.json();
        
        if (result.error) {
          output.textContent = t.error + ': ' + result.error;
          return;
        }
        
        console.log('Image result:', result);
        if (result.data && result.data.length > 0) {
          output.textContent = result.data.length + ' ' + t.generated;
          
          // Display all generated images
          let imagesHtml = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px; margin-top: 15px;">';
          
          result.data.forEach((img, index) => {
            let imgHtml = '';
            if (img.url) {
              imgHtml = '<img class="img-result" src="' + img.url + '" alt="Generated image ' + (index + 1) + '" style="width: 100%; border-radius: 8px;">';
            } else if (img.b64_json) {
              imgHtml = '<img class="img-result" src="data:image/jpeg;base64,' + img.b64_json + '" alt="Generated image ' + (index + 1) + '" style="width: 100%; border-radius: 8px;">';
            }
            
            if (imgHtml) {
              imagesHtml += '<div style="position: relative;"><div style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.7); color: white; padding: 5px 10px; border-radius: 4px; font-size: 12px;">#' + (index + 1) + '</div>' + imgHtml + '</div>';
            }
          });
          
          imagesHtml += '</div>';
          container.innerHTML = imagesHtml;
        } else {
          output.textContent = t.noImageData;
        }
      } catch (e) {
        output.textContent = t.error + ': ' + e.message;
      }
    }
  </script>
</body>
</html>`;
  return new Response(html, { headers: { ...corsHeaders(), "Content-Type": "text/html" } });
}
