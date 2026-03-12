import fs from 'fs';
import path from 'path';

const VAULT_DIR = path.resolve(process.cwd(), "boveda_conocimiento");

export const leerBoveda = {
  name: "leer_boveda",
  description: "Busca y lee el contenido de un archivo de texto en la bóveda de conocimiento. Útil para recordar reglas, detalles de un proyecto o el perfil del usuario.",
  execute: async (args: { nombre_archivo: string }) => {
    try {
      const filePath = path.join(VAULT_DIR, args.nombre_archivo);
      
      // Seguridad básica para evitar que el bot lea archivos fuera de la bóveda
      if (!filePath.startsWith(VAULT_DIR)) {
         return "Error de seguridad: Acceso denegado a esta ruta.";
      }
      
      if (!fs.existsSync(filePath)) {
         return `Error: El archivo '${args.nombre_archivo}' no existe en la bóveda.`;
      }
      
      const content = fs.readFileSync(filePath, "utf-8");
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
