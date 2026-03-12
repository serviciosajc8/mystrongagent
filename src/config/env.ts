import dotenv from "dotenv";

dotenv.config();

export const env = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
  TELEGRAM_ALLOWED_USER_IDS: (process.env.TELEGRAM_ALLOWED_USER_IDS || "").split(",").map((id) => id.trim()),
  GROQ_API_KEY: process.env.GROQ_API_KEY || "",
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || "openrouter/free",
  DB_PATH: process.env.DB_PATH || "./memory.db",
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || "./service-account.json",
};

export function validateEnv() {
  const missing: string[] = [];

  if (!env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN === "SUTITUYE POR EL TUYO") {
    missing.push("TELEGRAM_BOT_TOKEN");
  }
  
  if (!env.GROQ_API_KEY || env.GROQ_API_KEY === "SUTITUYE POR EL TUYO") {
    missing.push("GROQ_API_KEY");
  }

  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }
}
