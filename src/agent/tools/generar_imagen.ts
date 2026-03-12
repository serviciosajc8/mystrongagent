export const generarImagen = {
  name: "generar_imagen",
  description: "Crea una imagen visual o dibujo basado en una descripción en texto en INGLÉS proporcionada por ti.",
  execute: async (args: { prompt_en_ingles: string }) => {
    // Usamos el servicio gratuito Pollinations.ai que genera imágenes al vuelo basado en la URL
    const encodedPrompt = encodeURIComponent(args.prompt_en_ingles);
    // Agregamos un número aleatorio al final para evitar caché del navegador si pide la misma imagen
    const randomSeed = Math.floor(Math.random() * 1000000);
    const imageUrl = `https://pollinations.ai/p/${encodedPrompt}?width=800&height=800&seed=${randomSeed}&nologo=true`;
    
    // Retornamos el formato de imagen de Markdown, para que el frontend lo procese automáticamente
    return `![${args.prompt_en_ingles}](${imageUrl})`;
  },
  schema: {
    type: "function",
    function: {
      name: "generar_imagen",
      description: "Crea una imagen visual o dibujo basado en una descripción en texto.",
      parameters: {
        type: "object",
        properties: {
          prompt_en_ingles: {
            type: "string",
            description: "Descripción muy detallada en INGLÉS (tradúcelo tú) de lo que quieres que aparezca en la imagen para obtener mejores resultados.",
          },
        },
        required: ["prompt_en_ingles"],
      },
    },
  },
};
