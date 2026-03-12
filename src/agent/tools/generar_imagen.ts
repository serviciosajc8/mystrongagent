export const generarImagen = {
  name: "generar_imagen",
  description: "Crea una imagen visual o dibujo basado en una descripción. Puedes especificar el ancho y alto (opcional).",
  execute: async (args: { prompt_en_ingles: string, width?: number, height?: number }) => {
    const encodedPrompt = encodeURIComponent(args.prompt_en_ingles);
    const w = args.width || 1024;
    const h = args.height || 1024;
    const model = 'flux'; // Usamos el modelo Flux que es de alta calidad en Pollinations
    const randomSeed = Math.floor(Math.random() * 1000000);
    
    // Construimos la URL con parámetros de calidad
    const imageUrl = `https://pollinations.ai/p/${encodedPrompt}?width=${w}&height=${h}&seed=${randomSeed}&model=${model}&nologo=true&enhance=true`;
    
    return `![${args.prompt_en_ingles}](${imageUrl})`;
  },
  schema: {
    type: "function",
    function: {
      name: "generar_imagen",
      description: "Crea una imagen visual de alta calidad. Traduce el prompt del usuario al inglés para enviarlo.",
      parameters: {
        type: "object",
        properties: {
          prompt_en_ingles: {
            type: "string",
            description: "Descripción detallada en INGLÉS de la imagen.",
          },
          width: {
            type: "number",
            description: "Ancho de la imagen (ej: 1024 para cuadrado/landscape, 768 para vertical).",
          },
          height: {
            type: "number",
            description: "Alto de la imagen (ej: 1024 para cuadrado, 1280 para vertical).",
          }
        },
        required: ["prompt_en_ingles"],
      },
    },
  },
};
