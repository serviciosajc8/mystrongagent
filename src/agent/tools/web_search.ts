const TIMEOUT_MS = 10000;

function timeout() {
  return AbortSignal.timeout(TIMEOUT_MS);
}

// ─── Jina Search ────────────────────────────────────────────────────────────

export const jinaSearch = {
  schema: {
    type: "function",
    function: {
      name: "jina_search",
      description: "Busca información en internet usando Jina AI. Completamente gratuito, sin API key. Devuelve resultados en texto limpio optimizado para IA.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "La consulta de búsqueda." }
        },
        required: ["query"]
      }
    }
  },
  execute: async ({ query }: { query: string }): Promise<string> => {
    try {
      const url = `https://s.jina.ai/?q=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        signal: timeout(),
        headers: { "Accept": "text/plain", "X-No-Cache": "true" }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text || text.length < 50) throw new Error("Respuesta vacía");
      return `🔍 **Jina Search: "${query}"**\n\n${text.substring(0, 8000)}`;
    } catch (err: any) {
      return `❌ Jina Search falló: ${err.message}`;
    }
  }
};

// ─── Jina Reader ────────────────────────────────────────────────────────────

export const jinaReader = {
  schema: {
    type: "function",
    function: {
      name: "jina_reader",
      description: "Lee el contenido completo de una URL usando Jina Reader. Devuelve el texto limpio de la página en formato Markdown, ideal para analizar artículos o páginas web.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "La URL completa de la página a leer." }
        },
        required: ["url"]
      }
    }
  },
  execute: async ({ url }: { url: string }): Promise<string> => {
    try {
      const readerUrl = `https://r.jina.ai/${url}`;
      const res = await fetch(readerUrl, {
        signal: timeout(),
        headers: { "Accept": "text/plain", "X-No-Cache": "true" }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text || text.length < 50) throw new Error("Contenido vacío");
      return `📄 **Contenido de ${url}**\n\n${text.substring(0, 15000)}`;
    } catch (err: any) {
      return `❌ Jina Reader falló para ${url}: ${err.message}`;
    }
  }
};

// ─── Tavily Search ───────────────────────────────────────────────────────────

export const tavilySearch = {
  schema: {
    type: "function",
    function: {
      name: "tavily_search",
      description: "Busca información en internet usando Tavily, un motor de búsqueda optimizado para IA. Devuelve resultados estructurados con contexto relevante. Requiere TAVILY_API_KEY.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "La consulta de búsqueda." },
          max_results: { type: "number", description: "Número máximo de resultados (default: 5)." }
        },
        required: ["query"]
      }
    }
  },
  execute: async ({ query, max_results = 5 }: { query: string; max_results?: number }): Promise<string> => {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) return "⚠️ Tavily no disponible: falta TAVILY_API_KEY en las variables de entorno.";

    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        signal: timeout(),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          search_depth: "basic",
          max_results,
          include_answer: true,
          include_raw_content: false
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: any = await res.json();

      let output = `🔍 **Tavily Search: "${query}"**\n\n`;

      if (data.answer) {
        output += `**Respuesta directa:** ${data.answer}\n\n`;
      }

      (data.results || []).slice(0, max_results).forEach((r: any, i: number) => {
        output += `**[${i + 1}] ${r.title}**\n`;
        output += `🔗 ${r.url}\n`;
        if (r.content) output += `📝 ${r.content.substring(0, 300)}\n`;
        output += "\n";
      });

      return output || `No se encontraron resultados para "${query}".`;
    } catch (err: any) {
      return `❌ Tavily Search falló: ${err.message}`;
    }
  }
};

// ─── Serper Search (Google) ──────────────────────────────────────────────────

export const serperSearch = {
  schema: {
    type: "function",
    function: {
      name: "serper_search",
      description: "Busca en Google usando Serper API. Devuelve resultados reales de Google en formato JSON estructurado. Requiere SERPER_API_KEY.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "La consulta de búsqueda." },
          num: { type: "number", description: "Número de resultados (default: 6)." }
        },
        required: ["query"]
      }
    }
  },
  execute: async ({ query, num = 6 }: { query: string; num?: number }): Promise<string> => {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) return "⚠️ Serper no disponible: falta SERPER_API_KEY en las variables de entorno.";

    try {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        signal: timeout(),
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": apiKey
        },
        body: JSON.stringify({ q: query, num, hl: "es", gl: "mx" })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: any = await res.json();

      let output = `🔍 **Google (Serper): "${query}"**\n\n`;

      if (data.answerBox?.answer) {
        output += `**Respuesta directa:** ${data.answerBox.answer}\n\n`;
      }
      if (data.knowledgeGraph?.description) {
        output += `**Contexto:** ${data.knowledgeGraph.description}\n\n`;
      }

      (data.organic || []).slice(0, num).forEach((r: any, i: number) => {
        output += `**[${i + 1}] ${r.title}**\n`;
        output += `🔗 ${r.link}\n`;
        if (r.snippet) output += `📝 ${r.snippet}\n`;
        output += "\n";
      });

      output += `---\n💡 Puedes pedirme "lee el link 1" para obtener más detalle.`;
      return output;
    } catch (err: any) {
      return `❌ Serper Search falló: ${err.message}`;
    }
  }
};
