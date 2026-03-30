import { generateCompletion } from "./llm.js";
import { toolHandlers, toolsSchema } from "./tools/index.js";
import { getConversationHistory, saveMessage } from "../memory/firebase.js";
import fs from "fs";
import path from "path";

const MAX_ITERATIONS = 10;
const FORCE_RESPONSE_AT = 8; // A partir de esta iteración, deshabilitar herramientas para forzar respuesta de texto

function getSystemPrompt() {
  // Solo cargamos core.md para mantener el system prompt pequeño y no exceder
  // los límites de tokens de los modelos gratuitos (~15k TPM en Groq free tier).
  // Los demás skills son de desarrollo de software y no aportan al asistente personal.
  const corePath = path.join(process.cwd(), "src/agent/skills/core.md");
  let fullContent = "Eres Ju Blacky Agent, un asistente personal de IA desarrollado por tu creadora (a quien te diriges siempre en femenino). Tú eres masculino. Cuando alguien te pregunte cómo te llamas o quién eres, responde: 'Soy Ju Blacky Agent, tu asistente personal.' 😉\n";

  try {
    if (fs.existsSync(corePath)) {
      fullContent += "\n\n" + fs.readFileSync(corePath, "utf-8");
    }
  } catch (e) {
    console.error("Error cargando core.md:", e);
  }

  return { role: "system" as const, content: fullContent };
}

// Helper to extract fields for firebase saving to avoid ts errors
function helperFormatMsg(msg: any) {
  return {
    role: msg.role,
    content: msg.content,
    tool_calls: msg.tool_calls,
    tool_call_id: msg.tool_call_id,
    name: msg.name
  };
}

export async function processUserMessage(sessionId: string, userId: number, userMessage: string, preferredModel?: string): Promise<string> {
  // Guardamos mensaje del usuario
  await saveMessage(sessionId, { role: 'user', content: userMessage });

  // Historial actual
  const dbHistory = await getConversationHistory(sessionId, 25);
  
  // Auto-titular si es el inicio
  if (dbHistory.length <= 1) { 
    generateCompletion([
      { role: 'system', content: 'Crea un título de 3 palabras para este chat.' },
      { role: 'user', content: userMessage }
    ], undefined, false, 0, preferredModel).then(res => {
      if (res?.content) {
        import("../memory/firebase.js").then(m => m.updateSession(sessionId, { title: (res.content || "Nueva Sesión").replace(/["'./]/g, '') }));
      }
    }).catch(() => {});
  }

  const memoryHistory = [...dbHistory, { role: 'user', content: userMessage }];
  
  let iterations = 0;
  while (iterations < MAX_ITERATIONS) {
    iterations++;
    
    // Build context
    const history = [getSystemPrompt(), ...memoryHistory.map(m => {
      const cleanMsg: any = { role: m.role };
      if (m.content !== undefined) cleanMsg.content = m.content;
      if (m.name) cleanMsg.name = m.name;
      if (m.tool_calls) cleanMsg.tool_calls = m.tool_calls;
      if (m.tool_call_id) cleanMsg.tool_call_id = m.tool_call_id;
      return cleanMsg;
    })];

    // A partir de FORCE_RESPONSE_AT iteraciones, quitamos las herramientas para obligar al LLM a responder
    const toolsToUse = iterations >= FORCE_RESPONSE_AT ? undefined : toolsSchema;

    // Call LLM
    const responseMessage = await generateCompletion(history as any, toolsToUse, false, 0, preferredModel);
    
    if (!responseMessage) {
      return "Lo siento, ha ocurrido un error al procesar la respuesta.";
    }

    // Handle standard content response or tool calls
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      // Save assistant message showing intent to call tools
      const assistantMsg = {
        role: 'assistant' as const,
        content: responseMessage.content || null,
        tool_calls: responseMessage.tool_calls
      };
      await saveMessage(sessionId, helperFormatMsg(assistantMsg));
      memoryHistory.push(assistantMsg);

      // Execute tools
      let pendingImages: { filePath: string | null, url: string, prompt: string }[] = [];
      
      for (const toolCall of responseMessage.tool_calls) {
        const functionName = toolCall.function.name;
        let functionArgs = {};
        try {
          functionArgs = JSON.parse(toolCall.function.arguments || "{}");
        } catch(e) {
          console.error("Failed to parse tool arguments", e);
        }
        
        console.log(`[Agent] Executing tool: ${functionName}`);
        
        let resultContent = "";
        if (toolHandlers[functionName]) {
          try {
            const result = await toolHandlers[functionName](functionArgs);
            resultContent = String(result);
            
            // Detectar si es resultado de imagen
            if (functionName === 'generar_imagen') {
              try {
                const parsed = JSON.parse(resultContent);
                if (parsed.__type === 'image') {
                  pendingImages.push({
                    filePath: parsed.filePath,
                    url: parsed.url,
                    prompt: parsed.prompt
                  });
                }
              } catch {}
            }
          } catch (error) {
            console.error(`[Agent] Error executing tool ${functionName}:`, error);
            resultContent = `Error: ${error}`;
          }
        } else {
          resultContent = `Error: Tool ${functionName} not found.`;
        }

        // Save tool result
        const toolMsg = {
          role: 'tool' as const,
          content: resultContent,
          name: functionName,
          tool_call_id: toolCall.id
        };
        await saveMessage(sessionId, toolMsg);
        memoryHistory.push(toolMsg);
      }
      
      // Si hay imágenes pendientes, devolver directamente sin pasar por el LLM
      if (pendingImages.length > 0) {
        let finalResponse = "";
        for (const img of pendingImages) {
          finalResponse += `![${img.prompt}](${img.url})\n`;
        }
        // Agregar el filePath como metadata especial al final (el bot la usa)
        const imageMetaTag = `\n<!--IMAGES:${JSON.stringify(pendingImages)}-->`;
        const fullResponse = finalResponse.trim() + imageMetaTag;
        await saveMessage(sessionId, { role: 'assistant', content: fullResponse });
        return fullResponse;
      }
      
      // Loop continues to generate the final completion after seeing tool outputs
      continue;
    }
    
    // If no tool calls, return the content and save it
    if (responseMessage.content) {
      await saveMessage(sessionId, { role: 'assistant', content: responseMessage.content });
      return responseMessage.content;
    } else {
      return "Respuesta vacía del modelo.";
    }
  }
  
  return "Se ha alcanzado el límite de iteraciones del agente. Por favor, intenta de nuevo.";
}
