export const buscarInternet = {
  schema: {
    type: "function",
    function: {
      name: "buscar_internet",
      description: "Busca información actualizada en tiempo real en internet sobre cualquier tema (noticias, eventos, datos hoy).",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "La consulta de búsqueda. Sé específico y conciso. Ej: 'clima mexico hoy', 'precio bitcoin ahora', 'noticias ultima hora'",
          },
        },
        required: ["query"],
      },
    },
  },
  execute: async ({ query }: { query: string }) => {
    try {
      console.log(`[Tool] Buscando en internet: ${query}`);
      
      const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&t=MyStrongAgent`);
      const data = await response.json();
      
      let result = "";

      // 1. Intentar obtener el resumen directo (Abstract)
      if (data.AbstractText) {
        result += `INFORMACIÓN ENCONTRADA: ${data.AbstractText}\n`;
        if (data.AbstractSource) result += `FUENTE: ${data.AbstractSource}\n`;
      }
      
      // 2. Si no hay resumen, usar los temas relacionados (RelatedTopics)
      if (!data.AbstractText && data.RelatedTopics && data.RelatedTopics.length > 0) {
        const extraInfo = data.RelatedTopics
          .slice(0, 5)
          .map((t: any) => t.Text)
          .filter((t: any) => t && t.length > 10)
          .join("\n- ");
        
        if (extraInfo) {
          result += `DATOS RELACIONADOS:\n- ${extraInfo}\n`;
        }
      }

      // 3. Si no hay nada de nada
      if (!result || result.length < 20) {
        return `No se encontraron resultados directos para "${query}". \nSugerencia Interna: Intenta una búsqueda con palabras más simples o verifica la ortografía. Si es un evento muy reciente (hace minutos), puede que la caché no se haya actualizado.`;
      }

      return result;
    } catch (error: any) {
      console.error("Error en buscar_internet:", error);
      return `Error de conexión al buscar: ${error.message}`;
    }
  },
};
