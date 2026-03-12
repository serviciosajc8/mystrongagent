import { Bot } from "grammy";
import { env } from "../config/env.js";
import { processUserMessage } from "../agent/loop.js";
import { clearHistory } from "../memory/firebase.js";

// Ensure bot token exists before initialization
if (!env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN === "SUTITUYE POR EL TUYO") {
    console.error("TELEGRAM_BOT_TOKEN is not valid. Please set it in your .env file.");
    process.exit(1);
}

const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

// Middleware to restrict access to allowed user IDs
bot.use(async (ctx, next) => {
    if (!ctx.from) return;
    
    const userId = ctx.from.id.toString();
    if (!env.TELEGRAM_ALLOWED_USER_IDS.includes(userId)) {
        console.warn(`[Security] Unauthorized access attempt from User ID: ${userId}`);
        // Optionally notify them they are unauthorized, or simply ignore
        await ctx.reply("No estás autorizado para usar este bot.");
        return;
    }
    
    await next();
});

// Commands
bot.command("start", async (ctx) => {
    await ctx.reply("¡Hola! Soy MyStrongAgent. Estoy listo para ayudarte.");
});

bot.command("clear", async (ctx) => {
    const userId = ctx.from!.id;
    await clearHistory(`telegram_session_${userId}`);
    await ctx.reply("Historial de memoria borrado para tu sesión de Telegram.");
});

// Listen to all text messages
bot.on("message:text", async (ctx) => {
    try {
        await ctx.replyWithChatAction("typing");
        const userId = ctx.from.id;
        const sessionId = `telegram_session_${userId}`;
        const response = await processUserMessage(sessionId, userId, ctx.message.text);
        
        await ctx.reply(response);
    } catch (error) {
        console.error("Error processing message:", error);
        await ctx.reply("Ha ocurrido un error interno al procesar tu mensaje.");
    }
});

// Capture errors
bot.catch((err) => {
    console.error(`Error for ctx ${err.ctx.update.update_id}:`, err.error);
});

export function startBot() {
    console.log("Starting Telegram Bot via long polling...");
    bot.start();
}
