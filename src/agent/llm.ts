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

export async function generateCompletion(messages: any[], tools?: any[], useFallback = false) {
  // Primary: Groq
  if (!useFallback && groq) {
    try {
      const response = await groq.chat.completions.create({
        model: "llama-3.1-70b-versatile", // Cambiado a 3.1 para mayor estabilidad en todos los planes
        messages: messages.map(m => ({
          role: m.role,
          content: m.content || "",
          tool_calls: m.tool_calls,
          tool_call_id: m.tool_call_id,
          name: m.name
        })),
        tools: tools && tools.length > 0 ? tools : undefined,
        tool_choice: tools && tools.length > 0 ? "auto" : undefined,
        temperature: 0.5,
      });

      if (!response || !response.choices || response.choices.length === 0) {
        throw new Error("Respuesta vacía de Groq");
      }
      return response.choices[0].message;
    } catch (error: any) {
      console.error("Groq API error:", error.message);
      // Intenta con OpenRouter si Groq falla
      if (openRouter) {
        console.log("Intentando respaldo con OpenRouter...");
        return generateCompletion(messages, tools, true);
      }
      throw new Error(`Error en Groq: ${error.message}`);
    }
  } 
  
  // Secondary: OpenRouter
  if (openRouter) {
    try {
      const response = await openRouter.chat.completions.create({
        model: env.OPENROUTER_MODEL,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content || "",
          tool_calls: m.tool_calls,
          tool_call_id: m.tool_call_id,
          name: m.name
        })),
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
      throw new Error(`Error en Proveedor (Respaldo): ${error.message}`);
    }
  }

  throw new Error("No hay proveedores de IA configurados o disponibles.");
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
      console.error("Error transcribiendo audio con Groq:", error.message);
      throw new Error(`Error de transcripción: ${error.message}`);
    }
  } else {
    throw new Error("Se requiere la API de Groq para transcribir audio.");
  }
}
