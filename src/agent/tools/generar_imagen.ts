import fs from 'fs';
import path from 'path';
import os from 'os';

export const generarImagen = {
  name: "generar_imagen",
  description: "Crea una imagen visual o dibujo basado en una descripción. Puedes especificar el ancho y alto (opcional).",
  execute: async (args: { prompt_en_ingles: string, width?: number, height?: number, model?: string }) => {
    const encodedPrompt = encodeURIComponent(args.prompt_en_ingles);
    const w = args.width || 1024;
    const h = args.height || 1024;
    const model = args.model || 'flux';
    const randomSeed = Math.floor(Math.random() * 1000000);
    const key = "pk_31oNBvU9JLA1ApNX"; // Public key from Pollinations PLAY
    const imageUrl = `https://gen.pollinations.ai/image/${encodedPrompt}?width=${w}&height=${h}&seed=${randomSeed}&model=${model}&nologo=true&key=${key}`;
    
    console.log(`[ImageGen] Descargando imagen desde: ${imageUrl}`);
    
    try {
      const response = await fetch(imageUrl, { redirect: 'follow' });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const buffer = Buffer.from(await response.arrayBuffer());
      const tempFile = path.join(os.tmpdir(), `img_${Date.now()}.png`);
      fs.writeFileSync(tempFile, buffer);
      
      console.log(`[ImageGen] Imagen guardada: ${tempFile} (${buffer.length} bytes)`);
      
      // Devolvemos JSON especial que el loop detectará
      return JSON.stringify({
        __type: "image",
        filePath: tempFile,
        prompt: args.prompt_en_ingles,
        url: imageUrl,
        size: buffer.length
      });
    } catch (error: any) {
      console.error(`[ImageGen] Error descargando imagen:`, error.message);
      // Fallback: devolver URL directa
      return JSON.stringify({
        __type: "image",
        filePath: null,
        prompt: args.prompt_en_ingles,
        url: imageUrl,
        size: 0
      });
    }
  },
  schema: {
    type: "function",
    function: {
      name: "generar_imagen",
      description: "Crea una imagen visual de alta calidad. Traduce el prompt al inglés. IMPORTANTE: cuando obtengas el resultado, DEBES incluir la imagen en tu respuesta usando formato Markdown: ![descripcion](url)",
      parameters: {
        type: "object",
        properties: {
          prompt_en_ingles: {
            type: "string",
            description: "Descripción detallada en INGLÉS de la imagen.",
          },
          width: {
            type: "number",
            description: "Ancho (def: 1024).",
          },
          height: {
            type: "number",
            description: "Alto (def: 1024).",
          },
          model: {
            type: "string",
            description: "Modelo a usar. 'flux' es el mejor y estándar. 'grok-imagine' es muy bueno también.",
            enum: ["flux", "grok-imagine", "turbo"]
          }
        },
        required: ["prompt_en_ingles"],
      },
    },
  },
};
