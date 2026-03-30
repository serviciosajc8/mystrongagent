import { getCurrentTime } from "./get_current_time.js";
import { leerBoveda } from "./leer_boveda.js";
import { listarBoveda } from "./listar_boveda.js";
import { generarImagen } from "./generar_imagen.js";
import { buscarInternet } from "./buscar_internet.js";
import { leer_url } from "./leer_url.js";
import { jinaSearch, jinaReader, tavilySearch, serperSearch } from "./web_search.js";

// Export the tool implementations
export const toolHandlers: Record<string, Function> = {
  get_current_time: getCurrentTime.execute,
  leer_boveda: leerBoveda.execute,
  listar_boveda: listarBoveda.execute,
  generar_imagen: generarImagen.execute,
  buscar_internet: buscarInternet.execute,
  leer_url: leer_url.execute,
  jina_search: jinaSearch.execute,
  jina_reader: jinaReader.execute,
  tavily_search: tavilySearch.execute,
  serper_search: serperSearch.execute,
};

// Export the generic JSON schemas to pass to the LLM
export const toolsSchema = [
  getCurrentTime.schema,
  leerBoveda.schema,
  listarBoveda.schema,
  generarImagen.schema,
  buscarInternet.schema,
  {
    type: "function",
    function: {
      name: leer_url.name,
      description: leer_url.description,
      parameters: leer_url.parameters
    }
  },
  jinaSearch.schema,
  jinaReader.schema,
  tavilySearch.schema,
  serperSearch.schema,
];
