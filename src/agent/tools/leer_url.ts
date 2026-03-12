import axios from "axios";
import * as cheerio from "cheerio";

export const leer_url = {
  name: "leer_url",
  description: "Lee el contenido de una página web a partir de su URL. Úsalo para obtener detalles después de una búsqueda.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "La URL de la página a leer"
      }
    },
    required: ["url"]
  },
  async execute({ url }: { url: string }) {
    try {
      // Intentamos usar Jina Reader para obtener un Markdown limpio (es gratis y muy bueno para LLMs)
      const readerUrl = `https://r.jina.ai/${url}`;
      const response = await axios.get(readerUrl, { timeout: 10000 });
      
      let content = response.data;
      
      // Si por alguna razón falla o devuelve algo vacío, intentamos un scrapeo básico
      if (!content || typeof content !== 'string' || content.length < 100) {
        const directResp = await axios.get(url, { timeout: 10000 });
        const $ = cheerio.load(directResp.data);
        
        // Limpiamos la página
        $('script, style, nav, footer, header').remove();
        content = $('body').text().replace(/\s+/g, ' ').substring(0, 10000); // Límite de 10k caracteres
      }

      return `Contenido de la URL (${url}):\n\n${content.substring(0, 15000)}`;
    } catch (error: any) {
      console.error("Error leyendo URL:", error.message);
      return `Error al intentar leer la URL: ${error.message}. Intenta con otra o realiza una búsqueda diferente.`;
    }
  }
};
