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

import path from "path";
import fs from "fs";
import os from "os";
import { processAudio } from "../agent/llm.js";

// Listen to voice messages
bot.on("message:voice", async (ctx) => {
    try {
        await ctx.replyWithChatAction("typing");
        const userId = ctx.from.id;
        const sessionId = `telegram_session_${userId}`;

        const file = await ctx.getFile();
        const url = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
        
        // Download file
        const res = await fetch(url);
        const buffer = await res.arrayBuffer();
        
        // Formatear archivo temporal
        const tempPath = path.join(os.tmpdir(), `${ctx.message.message_id}.ogg`);
        fs.writeFileSync(tempPath, Buffer.from(buffer));
        
        // Notificar que se está transcribiendo
        // await ctx.reply("🎧 Transcribiendo tu audio...");

        const textToProcess = await processAudio(tempPath);
        fs.unlinkSync(tempPath); // Limpieza temporal

        if (!textToProcess || textToProcess.trim() === "") {
            await ctx.reply("No pude escuchar nada en el audio o estaba vacío.");
            return;
        }

        // Contestamos qué fue lo que entendió el agente (opcional pero util)
        await ctx.reply(`*Tú:* _${textToProcess}_`, { parse_mode: "Markdown" });

        // Procesar como texto normal
        const response = await processUserMessage(sessionId, userId, textToProcess);
        await ctx.reply(response);

    } catch (error) {
        console.error("Error processing voice message:", error);
        await ctx.reply("Ha ocurrido un error al procesar o transcribir tu audio.");
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
