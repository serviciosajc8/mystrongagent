import { Bot } from "grammy";
import { env } from "../config/env.js";
import { processUserMessage } from "../agent/loop.js";
import { clearHistory } from "../memory/firebase.js";
import path from "path";
import fs from "fs";
import os from "os";
import { processAudio } from "../agent/llm.js";

let bot: Bot | null = null;

function setupBot() {
    if (!env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN === "SUTITUYE POR EL TUYO" || env.TELEGRAM_BOT_TOKEN === "") {
        console.warn("⚠️ TELEGRAM_BOT_TOKEN no es válido. El bot de Telegram no se iniciará.");
        return null;
    }

    try {
        const newBot = new Bot(env.TELEGRAM_BOT_TOKEN);

        // Middleware to restrict access to allowed user IDs
        newBot.use(async (ctx, next) => {
            if (!ctx.from) return;
            
            const userId = ctx.from.id.toString();
            if (!env.TELEGRAM_ALLOWED_USER_IDS.includes(userId)) {
                console.warn(`[Security] Unauthorized access attempt from User ID: ${userId}`);
                await ctx.reply("No estás autorizado para usar este bot.");
                return;
            }
            
            await next();
        });

        // Commands
        newBot.command("start", async (ctx) => {
            await ctx.reply("¡Hola! Soy MyStrongAgent. Estoy listo para ayudarte.");
        });

        newBot.command("clear", async (ctx) => {
            const userId = ctx.from!.id;
            await clearHistory(`telegram_session_${userId}`);
            await ctx.reply("Historial de memoria borrado para tu sesión de Telegram.");
        });

        // Listen to all text messages
        newBot.on("message:text", async (ctx) => {
            try {
                await ctx.replyWithChatAction("typing");
                const userId = ctx.from.id;
                const sessionId = `telegram_session_${userId}`;
                const thinkingMsg = await ctx.reply("🧠 Pensando...");
                const response = await processUserMessage(sessionId, userId, ctx.message.text);
                
                await ctx.api.deleteMessage(ctx.chat.id, thinkingMsg.message_id);
                await ctx.reply(response);
            } catch (error: any) {
                console.error("Error processing message:", error);
                const errorMessage = error.message?.includes("429") 
                    ? "⚠️ Mis servidores están un poco saturados ahora mismo (error 429). Por favor, espera un minuto e inténtalo de nuevo, ¡estoy haciendo mi mejor esfuerzo! 😅"
                    : "❌ Hubo un error procesando tu mensaje. Inténtalo de nuevo.";
                await ctx.reply(errorMessage);
            }
        });

        // Listen to voice messages
        newBot.on("message:voice", async (ctx) => {
            try {
                await ctx.replyWithChatAction("typing");
                const userId = ctx.from.id;
                const sessionId = `telegram_session_${userId}`;

                const file = await ctx.getFile();
                const url = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
                
                const res = await fetch(url);
                const buffer = await res.arrayBuffer();
                
                const tempPath = path.join(os.tmpdir(), `${ctx.message.message_id}.ogg`);
                fs.writeFileSync(tempPath, Buffer.from(buffer));
                
                const textToProcess = await processAudio(tempPath);
                fs.unlinkSync(tempPath);

                if (!textToProcess || textToProcess.trim() === "") {
                    await ctx.reply("No pude escuchar nada en el audio o estaba vacío.");
                    return;
                }

                await ctx.reply(`*Tú:* _${textToProcess}_`, { parse_mode: "Markdown" });

                const thinkingMsg = await ctx.reply("🧠 Pensando...");
                const response = await processUserMessage(sessionId, userId, textToProcess);
                
                await ctx.api.deleteMessage(ctx.chat.id, thinkingMsg.message_id);
                await ctx.reply(response);
            } catch (error: any) {
                console.error("Error processing voice message:", error);
                const errorMessage = error.message?.includes("429")
                    ? "⚠️ Servidores saturados (error 429). Por favor, dame un minuto y vuelve a hablarme."
                    : "❌ Ups, tuve un problema procesando tu audio o mi cerebro está distraído. ¿Podrías repetirlo o escribirme?";
                await ctx.reply(errorMessage);
            }
        });

        newBot.catch((err) => {
            console.error(`Error for ctx ${err.ctx.update.update_id}:`, err.error);
        });

        return newBot;
    } catch (error) {
        console.error("Error al configurar el Bot de Telegram:", error);
        return null;
    }
}

export function startBot() {
    bot = setupBot();
    if (!bot) {
        console.log("No se pudo iniciar el bot de Telegram por falta de configuración válida.");
        return;
    }
    console.log("Starting Telegram Bot via long polling...");
    bot.start();
}
