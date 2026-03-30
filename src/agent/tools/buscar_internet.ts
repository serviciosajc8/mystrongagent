import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0'
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

async function scrapeGoogle(query: string): Promise<SearchResult[]> {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&gbv=1&hl=es`;
  const response = await axios.get(url, {
    timeout: 8000,
    headers: { 'User-Agent': getRandomUserAgent() }
  });
  
  const $ = cheerio.load(response.data);
  const results: SearchResult[] = [];
  
  // Google Basic HTML structure: '.egMi0' contains the results, 'h3' for title, 'a' for link, '.VwiC3b' for snippet
  // Note: gbv=1 uses a different old-school structure
  $('div.g').each((i, el) => {
    if (i >= 6) return false;
    const title = $(el).find('h3').text().trim();
    const link = $(el).find('a').attr('href');
    const snippet = $(el).find('.VwiC3b, .s3v9rd').first().text().trim();
    
    if (title && link) {
      let realLink = link;
      if (link.startsWith('/url?q=')) {
        realLink = new URL('https://google.com' + link).searchParams.get('q') || link;
      }
      results.push({ title, link: realLink, snippet });
    }
  });

  return results;
}

async function scrapeDuckDuckGo(query: string): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await axios.get(url, {
    timeout: 8000,
    headers: { 'User-Agent': getRandomUserAgent() }
  });
  
  const $ = cheerio.load(response.data);
  const results: SearchResult[] = [];
  
  $('.result').each((i, el) => {
    if (i >= 6) return false;
    const titleEl = $(el).find('.result__a');
    const title = titleEl.text().trim();
    const rawLink = titleEl.attr('href') || '';
    const snippet = $(el).find('.result__snippet').text().trim();
    
    if (title && rawLink) {
      let realLink = rawLink;
      if (rawLink.includes('uddg=')) {
        const paramString = rawLink.split('?')[1];
        const urlParams = new URLSearchParams(paramString);
        realLink = decodeURIComponent(urlParams.get('uddg') || rawLink);
      }
      if (realLink.startsWith('//')) realLink = 'https:' + realLink;
      results.push({ title, link: realLink, snippet });
    }
  });
  
  return results;
}

async function scrapeMojeek(query: string): Promise<SearchResult[]> {
  const url = `https://www.mojeek.com/search?q=${encodeURIComponent(query)}&lang=es`;
  const response = await axios.get(url, {
    timeout: 8000,
    headers: { 'User-Agent': getRandomUserAgent() }
  });
  
  const $ = cheerio.load(response.data);
  const results: SearchResult[] = [];
  
  $('.results-standard .ob').each((i, el) => {
    if (i >= 6) return false;
    const title = $(el).find('a.t').text().trim();
    const link = $(el).find('a.t').attr('href') || '';
    const snippet = $(el).find('.s').text().trim();
    if (title && link) results.push({ title, link, snippet });
  });
  
  return results;
}

export const buscarInternet = {
  schema: {
    type: "function",
    function: {
      name: "buscar_internet",
      description: "Busca información actualizada en tiempo real en internet sobre cualquier tema. Usa Google, DuckDuckGo y otros motores para garantizar resultados frescos y evitar bloqueos.",
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
    
    let allResults: SearchResult[] = [];
    const engines = [
      { name: 'Google', fn: scrapeGoogle },
      { name: 'DuckDuckGo', fn: scrapeDuckDuckGo },
      { name: 'Mojeek', fn: scrapeMojeek }
    ];

    for (const engine of engines) {
      try {
        console.log(`[Tool] Probando con ${engine.name}...`);
        const results = await engine.fn(query);
        if (results && results.length > 0) {
          allResults = results;
          console.log(`[Tool] ✅ Éxito con ${engine.name}. Se encontraron ${results.length} resultados.`);
          break; // Detenerse si el motor dio resultados
        }
      } catch (err: any) {
        console.warn(`[Tool] ⚠️ Falló ${engine.name}: ${err.message}`);
        continue; // Probar el siguiente motor
      }
    }

    if (allResults.length === 0) {
      return `❌ No se pudo obtener información de internet para "${query}" en este momento tras probar varios motores de búsqueda (Google, DDG, Mojeek). Es posible que haya una restricción de red temporal. Por favor, intenta de nuevo más tarde o simplifica tu búsqueda.`;
    }

    let output = `🔍 **Resultados de búsqueda: "${query}"**\n\n`;
    allResults.forEach((r, idx) => {
      output += `**[${idx + 1}] ${r.title}**\n`;
      output += `🔗 ${r.link}\n`;
      if (r.snippet) output += `📝 ${r.snippet}\n`;
      output += '\n';
    });

    output += `---\n💡 *Tip: Puedes pedirme "lee el link 1" si necesitas más detalle del primer resultado.*`;
    return output;
  },
};
