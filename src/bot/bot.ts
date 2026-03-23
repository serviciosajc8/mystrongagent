import { Bot, InputFile } from "grammy";
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
        
        // Verificación proactiva
        newBot.api.getMe().then((me) => {
            console.log(`[Telegram] Conectado exitosamente como @${me.username}`);
        }).catch(err => {
            console.error("❌ Error de comunicación con Telegram:", err);
        });

        // Función auxiliar para enviar respuestas inteligentes (detectar imágenes)
        async function handleSmartReply(ctx: any, response: string) {
            // Extraer metadata de imágenes si existe
            const metaMatch = response.match(/<!--IMAGES:(.*?)-->/s);
            let imagesMeta: { filePath: string | null, url: string, prompt: string }[] = [];
            
            if (metaMatch) {
                try {
                    imagesMeta = JSON.parse(metaMatch[1]);
                } catch {}
            }
            
            // Limpiar la respuesta de metadata y markdown de imagen
            let cleanResponse = response
                .replace(/<!--IMAGES:.*?-->/s, '')
                .replace(/!\[.*?\]\(https?:\/\/.*?\)/g, '')
                .trim();
            
            // Si hay imágenes detectadas en metadata, enviarlas directamente
            if (imagesMeta.length > 0) {
                for (const img of imagesMeta) {
                    try {
                        if (img.filePath && fs.existsSync(img.filePath)) {
                            // Enviar desde archivo local (más fiable)
                            console.log(`[Bot] Enviando imagen desde archivo local: ${img.filePath}`);
                            const fileBuffer = fs.readFileSync(img.filePath);
                            await ctx.replyWithPhoto(new InputFile(fileBuffer, 'imagen.png'), {
                                caption: img.prompt.substring(0, 200)
                            });
                            // Limpiar archivo temporal para ahorrar espacio
                            try { fs.unlinkSync(img.filePath); } catch {}
                        } else {
                            // Fallback: enviar por URL (con clave)
                            console.log(`[Bot] Enviando imagen desde URL: ${img.url}`);
                            await ctx.replyWithPhoto(new InputFile(img.url), {
                                caption: img.prompt.substring(0, 200)
                            });
                        }
                    } catch (e) {
                        console.error("Error al enviar foto:", e);
                        await ctx.reply(`🖼️ Imagen generada: ${img.url}`);
                    }
                }
                
                if (cleanResponse) {
                    await ctx.reply(cleanResponse);
                }
                return;
            }
            
            // Fallback original: buscar markdown de imágenes en el texto
            const imageRegex = /!\[.*?\]\((https:\/\/.*?)\)/g;
            let match;
            let lastIndex = 0;
            let foundImage = false;

            while ((match = imageRegex.exec(response)) !== null) {
                foundImage = true;
                const textBefore = response.substring(lastIndex, match.index).trim();
                const imageUrl = match[1];

                if (textBefore) {
                    await ctx.reply(textBefore);
                }

                try {
                    await ctx.replyWithPhoto(imageUrl);
                } catch (e) {
                    console.error("Error al enviar foto por URL:", e);
                    await ctx.reply(`🖼️ Imagen: ${imageUrl}`);
                }
                
                lastIndex = imageRegex.lastIndex;
            }

            const remainingText = response.substring(lastIndex).trim();
            if (remainingText) {
                await ctx.reply(remainingText);
            } else if (!foundImage && response) {
                await ctx.reply(response);
            }
        }


        // Middleware to restrict access to allowed user IDs
        newBot.use(async (ctx, next) => {
            if (!ctx.from) return;
            
            const userId = ctx.from.id.toString();
            if (!env.TELEGRAM_ALLOWED_USER_IDS.includes(userId)) {
                console.warn(`[Security] Unauthorized access attempt from User ID: ${userId}`);
                await ctx.reply(`🚫 No estás autorizado para usar este bot.\nTu User ID es: ${userId}`);
                return;
            }
            
            await next();
        });

        // Commands
        newBot.command("start", async (ctx) => {
            await ctx.reply("¡Hola! Soy MyStrongAgent. Estoy listo para ayudarte.");
        });

        newBot.command("ping", async (ctx) => {
            await ctx.reply(`¡Pong! 🏓 El bot está en línea.\nFecha: ${new Date().toLocaleString()}`);
        });

        newBot.command("clear", async (ctx) => {
            const userId = ctx.from!.id;
            await clearHistory(`telegram_session_${userId}`);
            await ctx.reply("Historial de memoria borrado para tu sesión de Telegram.");
        });

        // Listen to all text messages
        // Comando /reset (Alias de /clear para mayor intuición)
        newBot.command("reset", async (ctx) => {
            const userId = ctx.from!.id;
            console.log(`[Bot] Reset requested by user ${userId}`);
            await clearHistory(`telegram_session_${userId}`);
            await ctx.reply("🧹 Memoria limpia. ¡Empezamos de cero! 👋");
        });

        newBot.on("message:text", async (ctx) => {
            try {
                // Notificar lectura inmediatamente con acción de "escribiendo"
                await ctx.replyWithChatAction("typing");
                const thinkingMsg = await ctx.reply("🧠 Pensando...", { 
                    reply_parameters: { message_id: ctx.message.message_id }
                });

                const userId = ctx.from.id;
                const sessionId = `telegram_session_${userId}`;
                
                console.log(`[Bot] Procesando mensaje de ${userId}: ${ctx.message.text.substring(0, 30)}...`);
                const response = await processUserMessage(sessionId, userId, ctx.message.text);
                
                await ctx.api.deleteMessage(ctx.chat.id, thinkingMsg.message_id);
                await handleSmartReply(ctx, response);
            } catch (error: any) {
                console.error("Error processing message:", error);
                const isRateLimit = error.message?.includes("429") || error.status === 429;
                const errorMessage = isRateLimit
                    ? "⚠️ Mis servidores están saturados (429). Espera un minuto."
                    : `❌ Error técnico: ${error.message || 'Desconocido'}. Por favor, reintenta.`;
                
                try {
                    await ctx.reply(errorMessage);
                } catch {
                    // Si falla el envío de error, al menos logueamos
                    console.error("Critical failure sending error message to user");
                }
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
                await handleSmartReply(ctx, response);
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
