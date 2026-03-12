import axios from 'axios';
import * as cheerio from 'cheerio';

export const buscarInternet = {
  schema: {
    type: "function",
    function: {
      name: "buscar_internet",
      description: "Busca información actualizada en tiempo real en internet sobre cualquier tema (noticias, eventos, datos actuales). Usa esta herramienta cuando el usuario pregunte sobre noticias, eventos recientes, clima, sismos, precios, o cualquier dato que pueda haber cambiado.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "La consulta de búsqueda. Sé específico. Ej: 'último sismo México hoy', 'clima CDMX hoy', 'noticias Guatemala 2025'",
          },
        },
        required: ["query"],
      },
    },
  },
  execute: async ({ query }: { query: string }) => {
    try {
      console.log(`[Tool] Buscando en internet: ${query}`);
      
      // Primary: DuckDuckGo HTML (probado: retorna ~10 resultados confiables)
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await axios.get(searchUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'es-MX,es;q=0.9,en-US;q=0.7,en;q=0.5',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        }
      });

      const $ = cheerio.load(response.data);
      const results: { title: string; link: string; snippet: string }[] = [];

      // DuckDuckGo HTML usa `.result` con `.result__a` y `.result__snippet`
      $('.result').each((i, el) => {
        if (i >= 8) return false; // Solo primeros 8 resultados
        
        const titleEl = $(el).find('.result__a');
        const title = titleEl.text().trim();
        const rawLink = titleEl.attr('href') || '';
        const snippet = $(el).find('.result__snippet').text().trim();
        
        if (!title || !rawLink) return;

        // Decodificar links DDG que vienen como //duckduckgo.com/l/?uddg=URL_ENCODED
        let realLink = rawLink;
        if (rawLink.includes('uddg=')) {
          try {
            const paramString = rawLink.split('?')[1];
            const urlParams = new URLSearchParams(paramString);
            realLink = decodeURIComponent(urlParams.get('uddg') || rawLink);
          } catch {
            realLink = rawLink;
          }
        }
        if (realLink.startsWith('//')) {
          realLink = 'https:' + realLink;
        }

        // Filtrar dominios de anuncios/ecommerce irrelevantes
        const adDomains = ['amazon.com', 'amazon.com.mx', 'ebay.com', 'etsy.com', 'mercadolibre', 'aliexpress.com', 'walmart.com'];
        const isAd = adDomains.some(domain => realLink.includes(domain));
        if (isAd) return;

        results.push({ title, link: realLink, snippet });
      });

      if (results.length === 0) {
        return `No se encontraron resultados para: "${query}". El motor de búsqueda puede estar bloqueando la solicitud momentáneamente. Intenta ser más específico o usa menos palabras.`;
      }

      let output = `🔍 **Resultados de búsqueda: "${query}"**\n\n`;
      results.forEach((r, idx) => {
        output += `**[${idx + 1}] ${r.title}**\n`;
        output += `🔗 ${r.link}\n`;
        if (r.snippet) output += `📝 ${r.snippet}\n`;
        output += '\n';
      });

      output += `---\n💡 *Tip: Si necesitas más detalle de algún resultado, usa la herramienta \`leer_url\` con el link.*`;
      
      return output;

    } catch (error: any) {
      console.error("[Tool] Error en buscar_internet:", error.message);
      return `Error al buscar "${query}": ${error.message}. Por favor, intenta de nuevo en unos segundos.`;
    }
  },
};
