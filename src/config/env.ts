import dotenv from "dotenv";

dotenv.config();

export const env = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
  TELEGRAM_ALLOWED_USER_IDS: (process.env.TELEGRAM_ALLOWED_USER_IDS || "").split(",").map((id) => id.trim()),
  GROQ_API_KEY: process.env.GROQ_API_KEY || "",
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-exp:free",
  DB_PATH: process.env.DB_PATH || "./memory.db",
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || "./service-account.json",
  FIREBASE_API_KEY: process.env.FIREBASE_API_KEY || "",
  FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN || "",
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || "",
  FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET || "",
  FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
  FIREBASE_APP_ID: process.env.FIREBASE_APP_ID || "",
  GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY || "",
  OLLAMA_HOST: process.env.OLLAMA_HOST || "http://localhost:11434",
  MODEL_PROVIDER: process.env.MODEL_PROVIDER || "auto", // 'auto', 'ollama', 'groq', 'gemini', 'openrouter'
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || "llama3.2:3b",
};

export function validateEnv() {
  const missing: string[] = [];

  if (!env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN === "SUTITUYE POR EL TUYO") {
    missing.push("TELEGRAM_BOT_TOKEN");
  }

  if (!env.GROQ_API_KEY || env.GROQ_API_KEY === "SUTITUYE POR EL TUYO") {
    missing.push("GROQ_API_KEY");
  }

  const requiredFirebase = [
    "FIREBASE_API_KEY",
    "FIREBASE_AUTH_DOMAIN",
    "FIREBASE_PROJECT_ID",
    "FIREBASE_APP_ID",
  ] as const;

  for (const key of requiredFirebase) {
    if (!env[key] || env[key] === "SUTITUYE POR EL TUYO") {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    console.warn(`⚠️ ADVERTENCIA: Faltan variables de entorno requeridas: ${missing.join(", ")}`);
    console.warn("Algunas funciones (como el Bot o el Chat) podrían no funcionar correctamente.");
  }
}
