import axios from 'axios';

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

// Instancias públicas de SearXNG — API JSON, no requiere API key, cloud-friendly
const SEARXNG_INSTANCES = [
  'https://searx.be',
  'https://searxng.site',
  'https://search.bus-hit.me',
  'https://searx.tiekoetter.com',
  'https://paulgo.io',
];

async function searchSearXNG(query: string, instanceUrl: string): Promise<SearchResult[]> {
  const url = `${instanceUrl}/search`;
  const response = await axios.get(url, {
    timeout: 10000,
    params: {
      q: query,
      format: 'json',
      language: 'es',
      categories: 'general',
    },
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; MyBot/1.0)',
      'Accept': 'application/json',
    },
  });

  if (!response.data?.results?.length) return [];

  return response.data.results.slice(0, 6).map((r: any) => ({
    title: r.title || '',
    link: r.url || '',
    snippet: r.content || '',
  }));
}

async function searchBrave(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return [];

  const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
    timeout: 10000,
    params: { q: query, count: 6, lang: 'es' },
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
  });

  return (response.data?.web?.results || []).slice(0, 6).map((r: any) => ({
    title: r.title || '',
    link: r.url || '',
    snippet: r.description || '',
  }));
}

export const buscarInternet = {
  schema: {
    type: "function",
    function: {
      name: "buscar_internet",
      description: "Busca información actualizada en tiempo real en internet sobre cualquier tema.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "La consulta de búsqueda específica.",
          },
        },
        required: ["query"],
      },
    },
  },
  execute: async ({ query }: { query: string }) => {
    console.log(`[Tool] Buscando en internet: "${query}"`);

    // 1. Intentar Serper (Google) si hay API key
    const serperKey = process.env.SERPER_API_KEY;
    if (serperKey) {
      try {
        const res = await axios.post('https://google.serper.dev/search', { q: query, num: 6, hl: 'es' }, {
          timeout: 10000,
          headers: { 'Content-Type': 'application/json', 'X-API-KEY': serperKey }
        });
        const organic = res.data?.organic || [];
        if (organic.length > 0) {
          console.log('[Tool] ✅ Resultados via Serper (Google)');
          return formatResults(query, organic.map((r: any) => ({ title: r.title, link: r.link, snippet: r.snippet || '' })));
        }
      } catch (err: any) {
        console.warn(`[Tool] Serper falló: ${err.message}`);
      }
    }

    // 2. Intentar Tavily si hay API key
    const tavilyKey = process.env.TAVILY_API_KEY;
    if (tavilyKey) {
      try {
        const res = await axios.post('https://api.tavily.com/search',
          { api_key: tavilyKey, query, max_results: 6, search_depth: 'basic' },
          { timeout: 10000, headers: { 'Content-Type': 'application/json' } }
        );
        const results = res.data?.results || [];
        if (results.length > 0) {
          console.log('[Tool] ✅ Resultados via Tavily');
          return formatResults(query, results.map((r: any) => ({ title: r.title, link: r.url, snippet: r.content || '' })));
        }
      } catch (err: any) {
        console.warn(`[Tool] Tavily falló: ${err.message}`);
      }
    }

    // 3. Intentar Brave Search si hay API key configurada
    try {
      const results = await searchBrave(query);
      if (results.length > 0) {
        console.log(`[Tool] ✅ Resultados obtenidos via Brave Search.`);
        return formatResults(query, results);
      }
    } catch (err: any) {
      console.warn(`[Tool] Brave Search falló: ${err.message}`);
    }

    // 4. Intentar instancias de SearXNG en orden
    for (const instance of SEARXNG_INSTANCES) {
      try {
        console.log(`[Tool] Probando SearXNG: ${instance}`);
        const results = await searchSearXNG(query, instance);
        if (results.length > 0) {
          console.log(`[Tool] ✅ Resultados obtenidos via ${instance}`);
          return formatResults(query, results);
        }
      } catch (err: any) {
        console.warn(`[Tool] ${instance} falló: ${err.message}`);
      }
    }

    return `❌ No se encontraron resultados para "${query}" en este momento. Intenta reformular tu búsqueda o inténtalo de nuevo.`;
  },
};

function formatResults(query: string, results: SearchResult[]): string {
  let output = `🔍 **Resultados para: "${query}"**\n\n`;
  results.forEach((r, idx) => {
    output += `**[${idx + 1}] ${r.title}**\n`;
    output += `🔗 ${r.link}\n`;
    if (r.snippet) output += `📝 ${r.snippet}\n`;
    output += '\n';
  });
  output += `---\n💡 *Puedes pedirme "lee el link 1" para obtener más detalle.*`;
  return output;
}
