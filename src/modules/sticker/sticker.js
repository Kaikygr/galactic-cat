const fs = require('fs');
const path = require('path');
const util = require('util');
const { exec } = require('child_process');
const execProm = util.promisify(exec);

const tempDir = path.join(__dirname, "temp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

/**
 * Converte um arquivo de mídia (imagem ou vídeo) em um sticker WebP com metadados personalizados.
 *
 * Se o parâmetro "size" for "original", o sticker será gerado mantendo o tamanho original da mídia,
 * sem aplicar redimensionamento.
 *
 * A função realiza os seguintes passos:
 * 1. Converte a mídia para o formato WebP usando ffmpeg com a resolução especificada (ou original).
 * 2. Cria um cabeçalho EXIF contendo os dados do pacote de sticker.
 * 3. Chama o comando "webpmux" para embutir os metadados EXIF no arquivo WebP.
 * 4. Retorna o caminho do arquivo final (mantido na pasta temp).
 *
 * Requisitos: Instale o webpmux no seu sistema (por exemplo, via apt, brew ou manualmente).
 *
 * @param {string} mediaPath - Caminho do arquivo de mídia a ser convertido.
 * @param {string} [userLeg="User"] - Nome do pacote de sticker (geralmente o usuário).
 * @param {string} [ownerLeg="Owner"] - Nome do publicador do pacote de sticker (geralmente o owner).
 * @param {string} [size="800:800"] - Resolução desejada no formato "largura:altura" ou "original" para manter o tamanho original.
 * @returns {Promise<string>} - Caminho do sticker finalizado.
 * @throws {Error} Se ocorrer algum erro durante o processamento.
 */
async function createSticker(mediaPath, userLeg = "User", ownerLeg = "Owner", size = "512:512") {
  try {
    console.log(mediaPath);
    const outputPath = path.join(tempDir, `sticker_${Date.now()}.webp`);
    
    // Se "size" for "original", não aplica redimensionamento; caso contrário, usa -s.
    const sizeParam = (size !== "original") ? ` -s ${size}` : "";
    
    // Comando ffmpeg ajustado conforme a condição
    await execProm(`ffmpeg -i "${mediaPath}" -vcodec libwebp -filter:v fps=fps=15 -lossless 1 -loop 0 -preset default -an -vsync 0${sizeParam} "${outputPath}"`);
    
    // Prepara os metadados EXIF
    const json = { 
      "sticker-pack-name": userLeg, 
      "sticker-pack-publisher": ownerLeg 
    };
    const exifAttr = Buffer.from([
      0x49, 0x49, 0x2a, 0x00,
      0x08, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x41, 0x57,
      0x07, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x16, 0x00,
      0x00, 0x00
    ]);
    const jsonBuff = Buffer.from(JSON.stringify(json), "utf-8");
    const exifBuffer = Buffer.concat([exifAttr, jsonBuff]);
    exifBuffer.writeUIntLE(jsonBuff.length, 14, 4);

    // Cria um arquivo temporário para os metadados EXIF
    const metaPath = path.join(tempDir, `meta_${Date.now()}.temp.exif`);
    fs.writeFileSync(metaPath, exifBuffer);

    // Verifica se o webpmux está instalado
    let webpmuxPath = "";
    try {
      webpmuxPath = (await execProm("which webpmux")).stdout.trim();
      if (!webpmuxPath) throw new Error("webpmux não encontrado.");
    } catch (e) {
      throw new Error("webpmux não encontrado. Por favor, instale-o no seu sistema.");
    }
    
    // Usa o webpmux para embutir os metadados no arquivo WebP
    await execProm(`"${webpmuxPath}" -set exif "${metaPath}" "${outputPath}" -o "${outputPath}"`);
    
    // Remove o arquivo temporário de metadados
    fs.unlinkSync(metaPath);
    
    console.log("Sticker gerado:", outputPath);
    return outputPath;
   
  } catch (error) {
    throw new Error(`Erro ao criar sticker: ${error.message}`);
  }
}

module.exports = { createSticker };
