import axios from 'axios';
import * as cheerio from 'cheerio';

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
            description: "La consulta de búsqueda. Sé específico y conciso. Ej: 'último sismo méxico', 'clima cdmx hoy'",
          },
        },
        required: ["query"],
      },
    },
  },
  execute: async ({ query }: { query: string }) => {
    try {
      console.log(`[Tool] Buscando en internet (Scraping mode): ${query}`);
      
      // Intentar DuckDuckGo modo HTML para resultados reales y no solo resúmenes de wiki
      const response = await axios.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      const $ = cheerio.load(response.data);
      const results: any[] = [];

      $('.result').each((i, el) => {
        if (i < 5) {
          const title = $(el).find('.result__title').text().trim();
          const link = $(el).find('.result__url').attr('href');
          const snippet = $(el).find('.result__snippet').text().trim();
          if (title && link) {
            results.push({ title, link: link.startsWith('//') ? 'https:' + link : link, snippet });
          }
        }
      });

      if (results.length === 0) {
        return `No se encontraron resultados para "${query}". Intenta ser más general o usa 'leer_url' si conoces el enlace.`;
      }

      let formattedResults = `RESULTADOS DE BÚSQUEDA PARA "${query}":\n\n`;
      results.forEach((r, idx) => {
        formattedResults += `${idx + 1}. ${r.title}\n   LINK: ${r.link}\n   RESUMEN: ${r.snippet}\n\n`;
      });

      formattedResults += "INSTRUCCIÓN PARA TI: Si uno de estos links parece tener la respuesta definitiva, **DEBES USAR** 'leer_url' con ese enlace para leer el contenido completo y dar una respuesta verídica.";
      
      return formattedResults;
    } catch (error: any) {
      console.error("Error en buscar_internet:", error.message);
      return `Error al buscar en internet: ${error.message}. Intenta de nuevo.`;
    }
  },
};
