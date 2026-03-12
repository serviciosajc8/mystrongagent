import { generateCompletion } from "./llm.js";
import { toolHandlers, toolsSchema } from "./tools/index.js";
import { getConversationHistory, saveMessage } from "../memory/firebase.js";

const MAX_ITERATIONS = 5;

// Inject system prompt explicitly to guide the persona
const SYSTEM_PROMPT = {
  role: "system",
  content: `Eres MyStrongAgent, un asistente personal de IA desarrollado por tu creador (a quien te diriges siempre en femenino). Tú eres masculino.
Tus reglas más importantes:
1. Eres un políglota experto: Puedes entender y responder perfectamente en ESPAÑOL, INGLÉS y PORTUGUÉS. Identifica el idioma en el que te habla ella y responde en ese mismo idioma de forma natural, manteniendo tu personalidad concisa y directa.
2. NUNCA menciones cosas religiosas bajo ninguna circunstancia.
3. Da respuestas AL GRANO y CONCISAS en cualquiera de los idiomas.
4. Puedes ser amable, juguetón y usar groserías leves si el contexto lo permite.
5. Cuando ella te pida ayuda para una tarea, dale PASO A PASO.
6. Eres experto programador (HTML, JS, CSS).
7. CRÍTICO: Si usas generar_imagen, incluye el Markdown exacto sin cambios.
8. TIENES ACCESO A INTERNET: Si ella te pide noticias, datos actuales (como el clima, precio del dólar, eventos de hoy) o algo que no sepas, **DEBES USAR** la herramienta \`buscar_internet\` para darle información real y actualizada. No inventes datos.
`
};

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

export async function processUserMessage(sessionId: string, userId: number, userMessage: string): Promise<string> {
  // Save user message attached to sessionId
  await saveMessage(sessionId, { role: 'user', content: userMessage });

  // Fetch history EXACTLY ONCE at the start of the interaction
  const dbHistory = await getConversationHistory(sessionId, 30);
  const memoryHistory = [...dbHistory, { role: 'user', content: userMessage }];
  
  let iterations = 0;
  while (iterations < MAX_ITERATIONS) {
    iterations++;
    
    // Build context
    const history = [SYSTEM_PROMPT, ...memoryHistory.map(m => {
      const cleanMsg: any = { role: m.role };
      if (m.content !== undefined) cleanMsg.content = m.content;
      if (m.name) cleanMsg.name = m.name;
      if (m.tool_calls) cleanMsg.tool_calls = m.tool_calls;
      if (m.tool_call_id) cleanMsg.tool_call_id = m.tool_call_id;
      return cleanMsg;
    })];

    // Call LLM
    const responseMessage = await generateCompletion(history as any, toolsSchema);
    
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
