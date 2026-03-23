import Groq from "groq-sdk";
import OpenAI from "openai";
import { env } from "../config/env.js";
import fs from "fs";

const groq = env.GROQ_API_KEY && env.GROQ_API_KEY !== "SUTITUYE POR EL TUYO" 
  ? new Groq({ apiKey: env.GROQ_API_KEY }) 
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

function prepareMessages(messages: any[]) {
  return messages.map(m => {
    const msg: any = { role: m.role };
    
    // El contenido debe ser manejado con cuidado según el rol y si hay herramientas
    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
      msg.content = m.content || null; // Algunos proveedores fallan si content es "" con tool_calls
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

let cachedFreeModels: string[] = [];
let lastCacheUpdate = 0;

async function getBestFreeModel(): Promise<string> {
  // Solo actualizar el cache cada 1 hora para no saturar la API
  if (cachedFreeModels.length > 0 && Date.now() - lastCacheUpdate < 3600000) {
    return cachedFreeModels[0];
  }

  try {
    console.log("[LLM] Buscando mejores modelos gratuitos en OpenRouter...");
    const response = await fetch("https://openrouter.ai/api/v1/models");
    const data: any = await response.json();
    
    // Filtrar modelos gratuitos (prompt y completion cost = 0)
    const freeModels = data.data
      .filter((m: any) => m.pricing && m.pricing.prompt === "0")
      .map((m: any) => m.id);

    // Priorizar modelos específicos si existen en la lista de gratis
    const priority = ["google/gemini-2.0-flash-exp:free", "google/gemini", "anthropic/claude-3-haiku:free", "meta-llama/llama-3.1-70b-instruct:free"];
    const sorted = freeModels.sort((a: any, b: any) => {
      const idxA = priority.findIndex(p => a.includes(p));
      const idxB = priority.findIndex(p => b.includes(p));
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return 0;
    });

    if (sorted.length > 0) {
      cachedFreeModels = sorted;
      lastCacheUpdate = Date.now();
      return sorted[0];
    }
  } catch (e) {
    console.error("Error auto-detecting free models:", e);
  }

  return env.OPENROUTER_MODEL || "google/gemini-2.0-flash-exp:free";
}

export async function generateCompletion(messages: any[], tools?: any[], useFallback = false, groqModelIndex = 0, overrideModel?: string) {
  const formattedMessages = prepareMessages(messages);

  // Si el usuario pidió un modelo específico, intentarlo primero por OpenRouter
  if (overrideModel && openRouter && !useFallback) {
    try {
      console.log(`[LLM] Usando modelo solicitado por usuario: ${overrideModel}...`);
      const response = await openRouter.chat.completions.create({
        model: overrideModel,
        messages: formattedMessages,
        tools: tools && tools.length > 0 ? tools : undefined,
        tool_choice: tools && tools.length > 0 ? "auto" : undefined,
        temperature: 0.5,
      });
      if (response && response.choices && response.choices.length > 0) {
        return response.choices[0].message;
      }
    } catch (error: any) {
       console.error(`Error con modelo manual (${overrideModel}):`, error.message);
       // Si el modelo manual falla, caemos al flujo normal automático
    }
  }

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

      if (!response || !response.choices || response.choices.length === 0) {
        throw new Error("Respuesta vacía de Groq");
      }
      return response.choices[0].message;
    } catch (error: any) {
      console.error(`Groq error (${currentModel}):`, error.message);
      
      const errorMsg = error.message?.toLowerCase() || "";
      const isDecommissioned = errorMsg.includes("decommissioned") || errorMsg.includes("not found");
      const isToolError = errorMsg.includes("tool_use_failed") || errorMsg.includes("failed to call a function") || errorMsg.includes("failed_generation");

      // Si es un 400 fatal (y no herramientas/obsoleto), lanzar error
      if (error.status === 400 && !isDecommissioned && !isToolError) throw error;

      // Si es un 429 (Saturación), no reintentar con Groq, saltar directo a OpenRouter
      if (error.status === 429 && openRouter) {
        console.log("Groq saturado (429), saltando directo a OpenRouter...");
        return generateCompletion(messages, tools, true);
      }

      if (groqModelIndex + 1 < GROQ_MODELS.length) {
        console.log(`[LLM] Reintentando con el siguiente modelo de Groq...`);
        return generateCompletion(messages, tools, false, groqModelIndex + 1);
      }

      if (openRouter) {
        console.log("Cambiando a OpenRouter por error en todos los modelos de Groq...");
        return generateCompletion(messages, tools, true);
      }
      throw new Error(`Groq falló tras varios intentos: ${error.message}`);
    }
  } 
  
  if (openRouter) {
    try {
      // Selección automática del mejor modelo gratuito disponible en tiempo real
      const model = useFallback && cachedFreeModels.length > 1 ? cachedFreeModels[1] : await getBestFreeModel();
      
      console.log(`[LLM] Usando mejor modelo libre disponible: ${model}...`);
      const response = await openRouter.chat.completions.create({
        model: model,
        messages: formattedMessages,
        tools: tools && tools.length > 0 ? tools : undefined,
        tool_choice: tools && tools.length > 0 ? "auto" : undefined,
        temperature: 0.5,
      });
      if (!response || !response.choices || response.choices.length === 0) {
        throw new Error("Respuesta vacía de OpenRouter");
      }
      return response.choices[0].message;
    } catch (error: any) {
      console.error("OpenRouter API error:", error.message);
      
      // Si el primer modelo libre falla por saturación (429) o disponibilidad (404/400), intentar con el segundo
      const isAvailabilityError = error.status === 429 || error.status === 404 || error.status === 400 || 
                                 error.message?.includes("429") || error.message?.includes("404") || error.message?.includes("400");

      if (isAvailabilityError) {
         if (!useFallback && cachedFreeModels.length > 1) {
            console.log("[LLM] Modelo libre 1 no disponible o saturado, saltando al modelo 2 de respaldo...");
            return generateCompletion(messages, tools, true);
         }
      }

      throw new Error(`Error Proveedor (Respaldo): ${error.message}`);
    }
  }

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
