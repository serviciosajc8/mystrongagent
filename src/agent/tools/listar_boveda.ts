import fs from 'fs';
import path from 'path';

const VAULT_DIR = path.resolve(process.cwd(), "boveda_conocimiento");

export const listarBoveda = {
  name: "listar_boveda",
  description: "Lista todos los nombres de los archivos disponibles en la bóveda de conocimiento, para luego poder leerlos con la herramienta 'leer_boveda'.",
  execute: async () => {
    try {
      if (!fs.existsSync(VAULT_DIR)) {
        fs.mkdirSync(VAULT_DIR, { recursive: true });
        return "La bóveda estaba vacía y acaba de ser creada. No hay archivos actualmente.";
      }
      const files = fs.readdirSync(VAULT_DIR);
      if (files.length === 0) {
        return "La bóveda existe pero no contiene archivos por el momento.";
      }
      return `Archivos en la bóveda de conocimiento:\n${files.join('\n')}`;
    } catch (error) {
      return `Error al listar la bóveda: ${String(error)}`;
    }
  },
  schema: {
    type: "function",
    function: {
      name: "listar_boveda",
      description: "Lista todos los nombres de los archivos disponibles en la bóveda de conocimiento, para luego poder leerlos con la herramienta 'leer_boveda'.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
};
