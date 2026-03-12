import { getCurrentTime } from "./get_current_time.js";
import { leerBoveda } from "./leer_boveda.js";
import { listarBoveda } from "./listar_boveda.js";
import { generarImagen } from "./generar_imagen.js";

// Export the tool implementations
export const toolHandlers: Record<string, Function> = {
  get_current_time: getCurrentTime.execute,
  leer_boveda: leerBoveda.execute,
  listar_boveda: listarBoveda.execute,
  generar_imagen: generarImagen.execute,
};

// Export the generic JSON schemas to pass to the LLM
export const toolsSchema = [
  getCurrentTime.schema,
  leerBoveda.schema,
  listarBoveda.schema,
  generarImagen.schema,
];
