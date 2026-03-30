/**
 * Test de herramientas de búsqueda web
 * Ejecutar con: node src/agent/tools/webSearch.test.js
 * (Requiere Node.js >= 18 para fetch nativo)
 */

import { config } from "dotenv";
config();

const QUERY = "últimas noticias inteligencia artificial";
const TIMEOUT_MS = 10000;

function timeout() {
  return AbortSignal.timeout(TIMEOUT_MS);
}

// ─── Funciones de prueba ────────────────────────────────────────────────────

async function testJinaSearch() {
  const url = `https://s.jina.ai/?q=${encodeURIComponent(QUERY)}`;
  const res = await fetch(url, {
    signal: timeout(),
    headers: { "Accept": "text/plain" }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!text || text.length < 50) throw new Error("Respuesta vacía");
  return { preview: text.substring(0, 300), length: text.length };
}

async function testTavilySearch() {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey || apiKey === "SUTITUYE POR EL TUYO") throw new Error("TAVILY_API_KEY no configurada");
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    signal: timeout(),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, query: QUERY, max_results: 3, include_answer: true })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return { results: data.results?.length ?? 0, answer: data.answer?.substring(0, 200) };
}

async function testSerperSearch() {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey || apiKey === "SUTITUYE POR EL TUYO") throw new Error("SERPER_API_KEY no configurada");
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    signal: timeout(),
    headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
    body: JSON.stringify({ q: QUERY, num: 3, hl: "es" })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const firstUrl = data.organic?.[0]?.link;
  return { results: data.organic?.length ?? 0, firstUrl };
}

async function testJinaReader(url) {
  if (!url) throw new Error("No hay URL para leer");
  const readerUrl = `https://r.jina.ai/${url}`;
  const res = await fetch(readerUrl, {
    signal: timeout(),
    headers: { "Accept": "text/plain" }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!text || text.length < 50) throw new Error("Contenido vacío");
  return { url, preview: text.substring(0, 300), length: text.length };
}

// ─── Runner ─────────────────────────────────────────────────────────────────

async function run() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  TEST: Herramientas de Búsqueda Web");
  console.log(`  Query: "${QUERY}"`);
  console.log("═══════════════════════════════════════════════════════\n");

  const results = [];
  let serperFirstUrl = null;

  // Test 1: Jina Search
  process.stdout.write("1. Jina Search (sin API key)... ");
  try {
    const data = await testJinaSearch();
    console.log("✅ OK");
    console.log(`   Caracteres: ${data.length}`);
    console.log(`   Preview: ${data.preview.substring(0, 150).replace(/\n/g, " ")}...\n`);
    results.push({ name: "Jina Search", passed: true });
  } catch (err) {
    console.log(`❌ FALLÓ: ${err.message}\n`);
    results.push({ name: "Jina Search", passed: false, error: err.message });
  }

  // Test 2: Tavily Search
  process.stdout.write("2. Tavily Search (TAVILY_API_KEY)... ");
  try {
    const data = await testTavilySearch();
    console.log("✅ OK");
    console.log(`   Resultados: ${data.results}`);
    if (data.answer) console.log(`   Respuesta directa: ${data.answer}...`);
    console.log();
    results.push({ name: "Tavily Search", passed: true });
  } catch (err) {
    console.log(`❌ FALLÓ: ${err.message}\n`);
    results.push({ name: "Tavily Search", passed: false, error: err.message });
  }

  // Test 3: Serper Search
  process.stdout.write("3. Serper Search / Google (SERPER_API_KEY)... ");
  try {
    const data = await testSerperSearch();
    console.log("✅ OK");
    console.log(`   Resultados: ${data.results}`);
    if (data.firstUrl) {
      console.log(`   Primera URL: ${data.firstUrl}`);
      serperFirstUrl = data.firstUrl;
    }
    console.log();
    results.push({ name: "Serper Search", passed: true });
  } catch (err) {
    console.log(`❌ FALLÓ: ${err.message}\n`);
    results.push({ name: "Serper Search", passed: false, error: err.message });
  }

  // Test 4: Jina Reader (lee la primera URL de Serper)
  process.stdout.write("4. Jina Reader (lee primera URL de Serper)... ");
  try {
    const data = await testJinaReader(serperFirstUrl);
    console.log("✅ OK");
    console.log(`   URL leída: ${data.url}`);
    console.log(`   Caracteres extraídos: ${data.length}`);
    console.log(`   Preview: ${data.preview.substring(0, 150).replace(/\n/g, " ")}...\n`);
    results.push({ name: "Jina Reader", passed: true });
  } catch (err) {
    console.log(`❌ FALLÓ: ${err.message}\n`);
    results.push({ name: "Jina Reader", passed: false, error: err.message });
  }

  // ─── Resumen ───────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.passed).length;
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  RESUMEN: ${passed}/${results.length} herramientas funcionando`);
  console.log("═══════════════════════════════════════════════════════");
  results.forEach(r => {
    const icon = r.passed ? "✅" : "❌";
    const extra = r.passed ? "" : ` → ${r.error}`;
    console.log(`  ${icon} ${r.name}${extra}`);
  });
  console.log("═══════════════════════════════════════════════════════\n");
}

run().catch(err => {
  console.error("Error fatal en el test:", err);
  process.exit(1);
});
