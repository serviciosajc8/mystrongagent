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
    
    // El contenido solo se agrega si existe o no es nulo
    if (m.content !== undefined && m.content !== null) {
      msg.content = m.content;
    } else if (m.role === 'assistant' && m.tool_calls) {
      // Algunos proveedores requieren content nulo o vacío para respuestas con herramientas
      msg.content = null; 
    } else {
      msg.content = ""; // Fallback seguro
    }

    if (m.tool_calls) msg.tool_calls = m.tool_calls;
    if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
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

export async function generateCompletion(messages: any[], tools?: any[], useFallback = false, groqModelIndex = 0) {
  const formattedMessages = prepareMessages(messages);

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

      // Solo lanzar error fatal si es un 400 que NO es de herramientas ni de modelo obsoleto
      if (error.status === 400 && !isDecommissioned && !isToolError) throw error;

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
      const model = useFallback ? env.OPENROUTER_MODEL : "google/gemini-2.0-flash-exp:free";
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
      
      // Si es el primer intento con OpenRouter (usando el modelo rápido), intentar con el modelo principal
      if (!useFallback) {
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
