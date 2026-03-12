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
            description: "La consulta de búsqueda. Sé específico. Ej: 'precio dolar hoy mexico', 'noticias IA hoy', 'quien gano el partido de ayer'",
          },
        },
        required: ["query"],
      },
    },
  },
  execute: async ({ query }: { query: string }) => {
    try {
      console.log(`[Tool] Buscando en internet: ${query}`);
      
      // DuckDuckGo Instant Answer API
      const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&t=MyStrongAgent`);
      const data = await response.json();
      
      let result = "";

      if (data.AbstractText) {
        result += `RESUMEN: ${data.AbstractText}\n`;
      }
      
      if (data.AbstractSource) {
        result += `FUENTE: ${data.AbstractSource}\n`;
      }

      if (data.RelatedTopics && data.RelatedTopics.length > 0) {
        const topics = data.RelatedTopics
          .slice(0, 3)
          .map((t: any) => t.Text)
          .filter((t: any) => t)
          .join("\n- ");
        if (topics) result += `TEMAS RELACIONADOS:\n- ${topics}\n`;
      }

      if (!result) {
        return `No encontré un resumen directo para "${query}". Sugerencia para el agente: Intenta buscar términos más generales o en inglés si es un tema técnico, o informa que no hay datos inmediatos en el buscador rápido.`;
      }

      return result;
    } catch (error: any) {
      console.error("Error en buscar_internet:", error);
      return `Error técnico al buscar en internet: ${error.message}`;
    }
  },
};
