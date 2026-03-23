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
      // Selección de modelos gratuitos estables en OpenRouter desde el .env
      const primaryModel = env.OPENROUTER_MODEL || "google/gemini-2.0-flash-exp:free";
      const secondaryModel = "google/gemini-2.0-flash-exp:free"; // Doble seguro
      
      const model = useFallback ? secondaryModel : primaryModel;
      
      console.log(`[LLM] Intentando con OpenRouter (${model})...`);
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
      
      // Si el primer modelo de OpenRouter falla por saturación (429), intentar con el secundario
      if (!useFallback && (error.status === 429 || error.message?.includes("429"))) {
         console.log("[LLM] OpenRouter Primary saturado, intentando modelo secundario...");
         return generateCompletion(messages, tools, true);
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
