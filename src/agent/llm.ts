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
      return response.choices[0].message;
    } catch (error) {
      console.error("Groq API error. Falling back to OpenRouter...", error);
      return generateCompletion(messages, tools, true);
    }
  } else if (openRouter) {
    const response = await openRouter.chat.completions.create({
      model: env.OPENROUTER_MODEL,
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.5,
    });
    return response.choices[0].message;
  } else {
    throw new Error("No valid LLM client configuration found.");
  }
}

export async function processAudio(audioPath: string) {
  if (groq) {
    try {
      const translation = await groq.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: "whisper-large-v3",
        language: "es", // Opcional, pero ayuda a la velocidad si sabes que hablan español
        response_format: "json",
      });
      return translation.text;
    } catch (error) {
      console.error("Error transcribiendo audio con Groq:", error);
      throw error;
    }
  } else {
    throw new Error("Se requiere la API de Groq para transcribir audio.");
  }
}
