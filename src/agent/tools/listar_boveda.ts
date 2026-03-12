import { getBovedaFiles } from '../../memory/firebase.js';

export const listarBoveda = {
  name: "listar_boveda",
  description: "Lista todos los nombres de los archivos disponibles en la bóveda de conocimiento, para luego poder leerlos con la herramienta 'leer_boveda'.",
  execute: async () => {
    try {
      const files = await getBovedaFiles();
      if (files.length === 0) {
        return "La bóveda está vacía actualmente.";
      }
      return `Archivos en la bóveda de conocimiento:\n${files.map(f => f.name).join('\n')}`;
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
