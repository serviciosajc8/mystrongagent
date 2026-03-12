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
  if (!useFallback && groq) {
    try {
      const response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages,
        tools,
        tool_choice: "auto",
        temperature: 0.5,
      });

      if (!response || !response.choices || response.choices.length === 0) {
        throw new Error("Respuesta vacía de Groq");
      }
      return response.choices[0].message;
    } catch (error) {
      console.error("Groq API error. Falling back to OpenRouter...", error);
      return generateCompletion(messages, tools, true);
    }
  } else if (openRouter) {
    try {
      const response = await openRouter.chat.completions.create({
        model: env.OPENROUTER_MODEL,
        messages,
        tools,
        tool_choice: "auto",
        temperature: 0.5,
      });
      if (!response || !response.choices || response.choices.length === 0) {
        throw new Error("Respuesta vacía de OpenRouter");
      }
      return response.choices[0].message;
    } catch (error: any) {
      console.error("OpenRouter API error:", error);
      throw error;
    }
  } else {
    throw new Error("No valid LLM client configuration found.");
  }
}

export async function processAudio(audioPath: string) {
  if (groq) {
    try {
      // Intentamos enviar el archivo directamente
      const translation = await groq.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: "whisper-large-v3",
        language: "es",
        response_format: "json",
      });
      return translation.text;
    } catch (error: any) {
      console.error("Error transcribiendo audio con Groq:", error.message);
      throw error;
    }
  } else {
    throw new Error("Se requiere la API de Groq para transcribir audio.");
  }
}
