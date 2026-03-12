import { readBovedaFile } from '../../memory/firebase.js';

export const leerBoveda = {
  name: "leer_boveda",
  description: "Busca y lee el contenido de un archivo de texto en la bóveda de conocimiento. Útil para recordar reglas, detalles de un proyecto o el perfil del usuario.",
  execute: async (args: { nombre_archivo: string }) => {
    try {
      const content = await readBovedaFile(args.nombre_archivo);
      
      if (content === null) {
         return `Error: El archivo '${args.nombre_archivo}' no existe en la bóveda.`;
      }
      
      return content;
    } catch (error) {
      return `Error al leer la bóveda: ${String(error)}`;
    }
  },
  schema: {
    type: "function",
    function: {
      name: "leer_boveda",
      description: "Busca y lee el contenido de un archivo de texto en la bóveda de conocimiento. Útil para recordar reglas, detalles de un proyecto o el perfil del usuario.",
      parameters: {
        type: "object",
        properties: {
          nombre_archivo: {
            type: "string",
            description: "El nombre exacto del archivo a leer (ejemplo: 'proyecto_a.txt' o 'general_personalidad.txt').",
          },
        },
        required: ["nombre_archivo"],
      },
    },
  },
};
