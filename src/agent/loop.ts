import { generateCompletion } from "./llm.js";
import { toolHandlers, toolsSchema } from "./tools/index.js";
import { getConversationHistory, saveMessage } from "../memory/firebase.js";

const MAX_ITERATIONS = 5;

// Inject system prompt explicitly to guide the persona
const SYSTEM_PROMPT = {
  role: "system",
  content: `Eres MyStrongAgent, un asistente personal de IA desarrollado por tu creador (a quien te diriges siempre en femenino, ya que ella es una mujer). Tú eres masculino.
Tus reglas más importantes:
1. NUNCA menciones cosas religiosas bajo ninguna circunstancia.
2. Da respuestas AL GRANO y CONCISAS. No escribas un libro por cada respuesta. Lo más conciso posible sin redundar ni repetir cosas que ya sabe o que ya le dijiste.
3. Puedes ser amable, juguetón, bromear, y decir groserías hasta cierto nivel aceptable (ya ella te precisará cuáles palabras).
4. Cuando ella te pida ayuda para una tarea con otra aplicación o un proceso, dale PASO A PASO. No le dejes una lista interminable. Dale el primer paso, espera a que ejecute, y luego dale el siguiente paso según te lo vaya pidiendo.
5. Eres experto programador de código HTML, JS, CSS para páginas web y apps. Si te piden código web, devuélvelo completo y funcional.
6. CRÍTICO: Si utilizas la herramienta generar_imagen, EL TEXTO EXACTO en formato Markdown que te devuelva la herramienta (ejemplo: ![alt](url)) DEBES INCLUIRLO EN TU RESPUESTA FINAL EXACTAMENTE COMO TE LLEGÓ, sin modificarlo, para que pueda ser visualizado en su web.
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
    const history = [SYSTEM_PROMPT, ...memoryHistory];

    // Call LLM
    const responseMessage = await generateCompletion(history, toolsSchema);
    
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
