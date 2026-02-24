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
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ChatOpenAI.fr API (v${CONFIG.VERSION})</title>
  <style>
    :root { --bg: #0d1117; --panel: #161b22; --text: #c9d1d9; --accent: #10b981; --border: #30363d; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 40px 20px; }
    .container { max-width: 700px; width: 100%; }
    h1 { color: var(--accent); margin-bottom: 10px; }
    .badge { background: var(--accent); color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-left: 10px; }
    .card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 20px; margin: 20px 0; }
    .label { font-size: 12px; color: #8b949e; margin-bottom: 5px; }
    input, textarea, select { width: 100%; background: var(--bg); border: 1px solid var(--border); color: var(--text); padding: 10px; border-radius: 4px; font-family: monospace; margin-bottom: 10px; }
    button { background: var(--accent); color: #fff; border: none; padding: 12px 24px; border-radius: 4px; cursor: pointer; font-weight: bold; width: 100%; }
    button:hover { opacity: 0.9; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .output { background: #000; border-radius: 4px; padding: 15px; margin-top: 20px; white-space: pre-wrap; font-family: monospace; font-size: 13px; max-height: 400px; overflow-y: auto; }
    .tabs { display: flex; gap: 10px; margin-bottom: 15px; }
    .tab { padding: 8px 16px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; }
    .tab.active { background: var(--accent); border-color: var(--accent); }
    .img-result { max-width: 100%; border-radius: 8px; margin-top: 10px; }
    .info { font-size: 12px; color: #6e7681; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>ChatOpenAI.fr API <span class="badge">v${CONFIG.VERSION}</span></h1>
    <p style="color: #8b949e;">OpenAI-compatible API proxy for ChatOpenAI.fr (Chat + Images)</p>
    
    <div class="card">
      <div class="label">API Endpoint</div>
      <input type="text" id="apiUrl" readonly onclick="this.select()">
      <div class="info">Use with any OpenAI-compatible client. API key can be anything.</div>
    </div>
    
    <div class="card">
      <div class="tabs">
        <div class="tab active" onclick="switchTab('chat')">💬 Chat</div>
        <div class="tab" onclick="switchTab('image')">🎨 Image</div>
      </div>
      
      <div id="chat-panel">
        <div class="label">Model</div>
        <select id="chat-model">
          <option value="gpt-5.1">GPT-5.1</option>
          <option value="gpt-5-nano">GPT-5 Nano</option>
        </select>
        <div class="label">Message</div>
        <textarea id="prompt" rows="3">Bonjour, présente-toi brièvement.</textarea>
        <button onclick="sendChat()">Send Message</button>
      </div>
      
      <div id="image-panel" style="display:none;">
        <div class="label">Model</div>
        <select id="img-model">
          <option value="dall-e-3">DALL-E 3</option>
          <option value="dall-e-3-hd">DALL-E 3 HD</option>
          <option value="dall-e-2">DALL-E 2</option>
          <option value="gpt-image-1">GPT-Image-1</option>
          <option value="gpt-image-1.5" selected>GPT-Image-1.5</option>
        </select>
        <div class="label">Size</div>
        <select id="img-size">
          <option value="1024x1024" selected>1024x1024 (Square - All Models)</option>
          <option value="1792x1024">1792x1024 (Landscape - DALL-E 3)</option>
          <option value="1024x1792">1024x1792 (Portrait - DALL-E 3)</option>
          <option value="2048x2048">2048x2048 (Large Square - GPT-Image-1.5)</option>
          <option value="2048x1536">2048x1536 (Large Landscape - GPT-Image-1.5)</option>
          <option value="1536x2048">1536x2048 (Large Portrait - GPT-Image-1.5)</option>
          <option value="512x512">512x512 (DALL-E 2 only)</option>
          <option value="256x256">256x256 (DALL-E 2 only)</option>
        </select>
        <div class="label">Style</div>
        <select id="img-style">
          <option value="natural" selected>Natural</option>
          <option value="vivid">Vivid</option>
        </select>
        <div class="label">Quality</div>
        <select id="img-quality">
          <option value="standard" selected>Standard</option>
          <option value="hd">HD</option>
        </select>
        <div class="label">Output Format</div>
        <select id="img-output-format">
          <option value="jpeg" selected>JPEG</option>
          <option value="png">PNG</option>
          <option value="webp">WebP</option>
        </select>
        <div class="label">Background</div>
        <select id="img-background">
          <option value="auto" selected>Auto</option>
          <option value="transparent">Transparent</option>
          <option value="opaque">Opaque</option>
        </select>
        <div class="label">Number of Images</div>
        <select id="img-n">
          <option value="1" selected>1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
        </select>
        <div class="label">Prompt</div>
        <textarea id="img-prompt" rows="3">A cute orange cat sitting on a windowsill, digital art</textarea>
        <button onclick="generateImage()">Generate Image(s)</button>
      </div>
    </div>
    
    <div class="output" id="output">Ready to test...</div>
    <div id="img-container"></div>
  </div>
  <script>
    document.getElementById('apiUrl').value = location.origin + '/v1';
    
    function switchTab(tab) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      event.target.classList.add('active');
      document.getElementById('chat-panel').style.display = tab === 'chat' ? 'block' : 'none';
      document.getElementById('image-panel').style.display = tab === 'image' ? 'block' : 'none';
      document.getElementById('img-container').innerHTML = '';
    }
    
    async function sendChat() {
      const output = document.getElementById('output');
      const prompt = document.getElementById('prompt').value;
      const model = document.getElementById('chat-model').value;
      output.textContent = 'Sending to ' + model + '...';
      
      try {
        const response = await fetch('/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: true })
        });
        
        if (!response.ok) {
          output.textContent = 'Error: ' + await response.text();
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
      
      output.textContent = 'Generating ' + n + ' image(s) with ' + model + ' (' + style + ', ' + quality + ')...';
      container.innerHTML = '';
      
      try {
        const response = await fetch('/v1/images/generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
          output.textContent = 'Error: ' + result.error;
          return;
        }
        
        console.log('Image result:', result);
        if (result.data && result.data.length > 0) {
          output.textContent = result.data.length + ' image(s) generated successfully!';
          
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
          output.textContent = 'No image data in response';
        }
      } catch (e) {
        output.textContent = 'Error: ' + e.message;
      }
    }
  </script>
</body>
</html>`;
  return new Response(html, { headers: { ...corsHeaders(), "Content-Type": "text/html" } });
}
