import { validateEnv } from "./config/env.js";
import { initDB } from "./memory/firebase.js";
import { startBot } from "./bot/bot.js";
import { startServer } from "./server.js";

async function main() {
  console.log("🚀 Iniciando MyStrongAgent...");

  // 1. Validate environment configuration
  console.log("Configurando variables de entorno...");
  validateEnv();

  // 2. Initialize the Firebase connection
  console.log("Inicializando base de datos en Firebase...");
  initDB();

  // 3. Iniciar Servidor Web
  console.log("Levantando servidor web local...");
  startServer();

  // 4. Start Telegram Bot
  startBot();

  console.log("✅ MyStrongAgent está activo y esperando mensajes.");
}

main().catch((err) => {
  console.error("Error crítico durante el inicio:", err);
  process.exit(1);
});

// Capture exit signals
process.on("SIGINT", () => {
    console.log("Cerrando la aplicación...");
    process.exit(0);
});
process.on("SIGTERM", () => {
    console.log("Cerrando la aplicación...");
    process.exit(0);
});

// PREVENIR CIERRES POR ERRORES NO CAPTURADOS
process.on("uncaughtException", (err) => {
    console.error("❌ Error no capturado (Manteniendo APP activa):", err);
});

process.on("unhandledRejection", (reason, promise) => {
    console.error("❌ Promesa rechazada no manejada (Manteniendo APP activa):", reason);
});
