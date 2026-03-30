import Groq from "groq-sdk";
import OpenAI from "openai";
import { env } from "../config/env.js";
import fs from "fs";

const groq = env.GROQ_API_KEY && env.GROQ_API_KEY !== "SUTITUYE POR EL TUYO"
  ? new Groq({ apiKey: env.GROQ_API_KEY })
  : null;

// Google Gemini vía endpoint OpenAI-compatible (gratuito, excelente con herramientas)
const gemini = env.GOOGLE_AI_API_KEY && env.GOOGLE_AI_API_KEY !== "SUTITUYE POR EL TUYO"
  ? new OpenAI({
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      apiKey: env.GOOGLE_AI_API_KEY,
    })
  : null;

const openRouter = env.OPENROUTER_API_KEY && env.OPENROUTER_API_KEY !== "SUTITUYE POR EL TUYO"
  ? new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: env.OPENROUTER_API_KEY,
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/MyStrongAgent",
        "X-Title": "MyStrongAgent",
      }
    })
  : null;

const ollama = new OpenAI({
  baseURL: `${env.OLLAMA_HOST}/v1`,
  apiKey: "ollama", // Required by OpenAI SDK but ignored by Ollama
});

function prepareMessages(messages: any[]) {
  return messages.map(m => {
    const msg: any = { role: m.role };
    
    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
      msg.content = m.content || null;
      msg.tool_calls = m.tool_calls;
    } else if (m.role === 'tool') {
      msg.content = m.content || "";
      msg.tool_call_id = m.tool_call_id;
    } else {
      msg.content = m.content || "";
    }

    if (m.name) msg.name = m.name;
    
    return msg;
  });
}

const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama3-70b-8192",
  "llama-3.1-8b-instant",
  "mixtral-8x7b-32768",
];

// Modelos de respaldo hardcodeados en orden de preferencia (nunca quedar sin opciones)
const FALLBACK_MODELS = [
  "google/gemini-2.0-flash-exp:free",
  "google/gemini-flash-1.5:free",
  "meta-llama/llama-3.2-11b-vision-instruct:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  "qwen/qwen-2.5-7b-instruct:free",
  "mistralai/mistral-7b-instruct:free",
];

let cachedFreeModels: string[] = [];
let lastCacheUpdate = 0;

async function getOrderedFreeModels(): Promise<string[]> {
  // Refrescar cache cada hora
  if (cachedFreeModels.length > 0 && Date.now() - lastCacheUpdate < 3600000) {
    return cachedFreeModels;
  }

  try {
    console.log("[LLM] Buscando modelos gratuitos en OpenRouter en tiempo real...");
    const response = await fetch("https://openrouter.ai/api/v1/models");
    const data: any = await response.json();
    
    // Filtrar solo modelos con costo cero
    const freeModels: string[] = data.data
      .filter((m: any) => m.pricing && m.pricing.prompt === "0")
      .map((m: any) => m.id as string);

    // Priorizar Gemini > Llama > otros
    const priority = ["google/gemini", "meta-llama", "qwen", "mistralai"];
    const sorted = freeModels.sort((a, b) => {
      const idxA = priority.findIndex(p => a.includes(p));
      const idxB = priority.findIndex(p => b.includes(p));
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return 0;
    });

    if (sorted.length > 0) {
      // Combinar la lista en tiempo real con los fallbacks hardcodeados (sin duplicados)
      const combined = [...new Set([...sorted, ...FALLBACK_MODELS])];
      cachedFreeModels = combined;
      lastCacheUpdate = Date.now();
      console.log(`[LLM] ${combined.length} modelos gratuitos disponibles. Top: ${combined[0]}`);
      return combined;
    }
  } catch (e) {
    console.error("[LLM] Error buscando modelos, usando lista de respaldo hardcodeada:", e);
  }

  // Si falla la API, usar la lista hardcodeada como último recurso
  cachedFreeModels = FALLBACK_MODELS;
  return FALLBACK_MODELS;
}

// Intenta Gemini 2.0 Flash directamente (más capaz que OpenRouter free para herramientas)
async function tryGemini(messages: any[], tools?: any[]): Promise<any> {
  if (!gemini) throw new Error("Gemini no configurado");
  console.log("[LLM] Intentando con Gemini 2.0 Flash...");
  const response = await gemini.chat.completions.create({
    model: "gemini-2.0-flash",
    messages,
    tools: tools && tools.length > 0 ? tools : undefined,
    tool_choice: tools && tools.length > 0 ? "auto" : undefined,
    temperature: 0.5,
  });
  if (!response?.choices?.length) throw new Error("Respuesta vacía de Gemini");
  console.log("[LLM] ✅ Éxito con Gemini 2.0 Flash");
  return response.choices[0].message;
}

// Intenta OpenRouter con una cascada completa de modelos hasta encontrar uno que funcione
async function tryOpenRouterCascade(messages: any[], tools?: any[], modelIndex = 0): Promise<any> {
  const models = await getOrderedFreeModels();
  
  if (modelIndex >= models.length) {
    throw new Error("Todos los modelos gratuitos de OpenRouter están no disponibles en este momento. Intenta en unos minutos.");
  }

  const model = models[modelIndex];
  console.log(`[LLM] OpenRouter - Intentando modelo ${modelIndex + 1}/${models.length}: ${model}`);
  
  try {
    // Añadimos un pequeño retardo entre cada intento para evitar que OpenRouter nos bloquee por velocidad
    if (modelIndex > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const response = await openRouter!.chat.completions.create({
      model: model,
      messages: messages,
      tools: tools && tools.length > 0 ? tools : undefined,
      tool_choice: tools && tools.length > 0 ? "auto" : undefined,
      temperature: 0.5,
    });

    if (!response || !response.choices || response.choices.length === 0) {
      throw new Error("Respuesta vacía");
    }
    
    console.log(`[LLM] ✅ Éxito con modelo: ${model}`);
    return response.choices[0].message;
  } catch (error: any) {
    const msg = error.message || "";
    const status = error.status || 0;
    
    // Si es un error de disponibilidad/saturación/pago/guardrail, saltar al siguiente modelo
    const isRetryable = status === 429 || status === 404 || status === 400 || status === 402 || status === 503 ||
                        msg.includes("429") || msg.includes("404") || msg.includes("402") || msg.includes("503") ||
                        msg.includes("guardrail") || msg.includes("data policy") ||
                        msg.includes("no endpoints") || msg.includes("not found") ||
                        msg.includes("decommissioned") || msg.includes("provider") ||
                        msg.includes("payment") || msg.includes("quota") ||
                        msg.includes("unavailable") || msg.includes("overloaded");
    
    if (isRetryable) {
      console.log(`[LLM] Modelo ${model} no disponible/error temporal (${status}), probando siguiente...`);
      return tryOpenRouterCascade(messages, tools, modelIndex + 1);
    }
    
    // Error fatal no recuperable
    throw new Error(`Error Proveedor (Respaldo): ${msg}`);
  }
}

// Intenta Ollama local
async function tryOllama(messages: any[], tools?: any[]): Promise<any> {
  console.log(`[LLM] Intentando con Ollama Local (${env.OLLAMA_MODEL})...`);
  try {
    const response = await ollama.chat.completions.create({
      model: env.OLLAMA_MODEL,
      messages,
      tools: tools && tools.length > 0 ? tools : undefined,
      tool_choice: tools && tools.length > 0 ? "auto" : undefined,
      temperature: 0.5,
    });

    if (!response?.choices?.length) throw new Error("Respuesta vacía de Ollama");
    console.log(`[LLM] ✅ Éxito con Ollama (${env.OLLAMA_MODEL})`);
    return response.choices[0].message;
  } catch (error: any) {
    console.error(`Ollama error:`, error.message);
    throw error;
  }
}

export async function generateCompletion(messages: any[], tools?: any[], useFallback = false, groqModelIndex = 0, overrideModel?: string) {
  const formattedMessages = prepareMessages(messages);
  
  // Si se fuerza usar Ollama en el .env (Desactivado automáticamente en Render/Nube)
  const isCloud = process.env.RENDER === "true" || process.env.NODE_ENV === "production";
  if (env.MODEL_PROVIDER === "ollama" && !isCloud) {
    try {
      return await tryOllama(formattedMessages, tools);
    } catch (e: any) {
      console.warn("[LLM] Ollama no disponible localmente, cayendo a proveedores remotos...");
    }
  }

  // Si el usuario eligió un modelo específico via /cerebro
  if (overrideModel && openRouter && !useFallback) {
    try {
      console.log(`[LLM] Usando modelo elegido por usuario: ${overrideModel}...`);
      const response = await openRouter.chat.completions.create({
        model: overrideModel,
        messages: formattedMessages,
        tools: tools && tools.length > 0 ? tools : undefined,
        tool_choice: tools && tools.length > 0 ? "auto" : undefined,
        temperature: 0.5,
      });
      if (response?.choices?.length > 0) return response.choices[0].message;
    } catch (error: any) {
      console.error(`Error con modelo manual (${overrideModel}):`, error.message);
      // Si falla el modelo manual, caer al flujo automático
    }
  }

  // Intentar con Groq primero (el más rápido)
  if (!useFallback && groq && groqModelIndex < GROQ_MODELS.length) {
    const currentModel = GROQ_MODELS[groqModelIndex];
    try {
      console.log(`[LLM] Intentando con Groq (${currentModel})...`);
      const response = await groq.chat.completions.create({
        model: currentModel,
        messages: formattedMessages,
        tools: tools && tools.length > 0 ? tools : undefined,
        tool_choice: tools && tools.length > 0 ? "auto" : undefined,
        temperature: 0.5,
      });

      if (!response?.choices?.length) throw new Error("Respuesta vacía de Groq");
      return response.choices[0].message;
    } catch (error: any) {
      console.error(`Groq error (${currentModel}):`, error.message);
      
      const errorMsg = error.message?.toLowerCase() || "";
      const isDecommissioned = errorMsg.includes("decommissioned") || errorMsg.includes("not found");
      const isToolError = errorMsg.includes("tool_use_failed") || errorMsg.includes("failed_generation");

      if (error.status === 400 && !isDecommissioned && !isToolError) throw error;

      // 429 = saturado, saltar directo a Gemini o OpenRouter
      if (error.status === 429) {
        console.log("Groq saturado (429), saltando a Gemini...");
        if (gemini) return tryGemini(formattedMessages, tools);
        if (openRouter) return tryOpenRouterCascade(formattedMessages, tools);
      }

      // Intentar siguiente modelo de Groq
      if (groqModelIndex + 1 < GROQ_MODELS.length) {
        return generateCompletion(messages, tools, false, groqModelIndex + 1, overrideModel);
      }

      // Todos los de Groq fallaron, ir a Gemini y luego OpenRouter
      if (gemini) return tryGemini(formattedMessages, tools);
      if (openRouter) return tryOpenRouterCascade(formattedMessages, tools);
      throw new Error(`Groq falló: ${error.message}`);
    }
  }

  // Directo a Gemini y luego OpenRouter (cuando useFallback=true o Groq no disponible)
  if (gemini) return tryGemini(formattedMessages, tools);
  if (openRouter) return tryOpenRouterCascade(formattedMessages, tools);

  throw new Error("Sin proveedores de IA configurados.");
}

export async function processAudio(audioPath: string) {
  if (groq) {
    try {
      const translation = await groq.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: "whisper-large-v3",
        language: "es",
        response_format: "json",
      });
      return translation.text;
    } catch (error: any) {
      console.error("Groq Whisper error:", error.message);
      throw new Error(`Error voz: ${error.message}`);
    }
  } else {
    throw new Error("Groq API necesaria para voz.");
  }
}
