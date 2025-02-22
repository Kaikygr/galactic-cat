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
 * A função realiza os seguintes passos:
 * 1. Converte a mídia para o formato WebP usando ffmpeg com a resolução passada.
 * 2. Verifica se o comando "webpmux" está disponível para embutir metadados EXIF.
 * 3. Cria um cabeçalho EXIF contendo os dados do pacote de sticker.
 * 4. Embute os metadados no arquivo WebP.
 * 5. Retorna o caminho do arquivo final (mantido na pasta temp).
 *
 * @param {string} mediaPath - Caminho do arquivo de mídia a ser convertido.
 * @param {string} [userLeg="User"] - Nome do pacote de sticker (geralmente o usuário).
 * @param {string} [ownerLeg="Owner"] - Nome do publicador do pacote de sticker (geralmente o owner).
 * @param {string} [size="800:800"] - Resolução desejada no formato "largura:altura".
 * @returns {Promise<string>} - Caminho do sticker finalizado.
 * @throws {Error} Se ocorrer algum erro durante o processamento do sticker.
 */
async function createSticker(mediaPath, userLeg = "User", ownerLeg = "Owner", size = "800:800") {
  try {
    console.log(mediaPath);
    const outputPath = path.join(tempDir, `sticker_${Date.now()}.webp`);
    
    // Executa ffmpeg para converter a mídia para WebP com a resolução definida.
    await execProm(`ffmpeg -i "${mediaPath}" -vcodec libwebp -filter:v fps=fps=15 -lossless 1 -loop 0 -preset default -an -vsync 0 -s ${size} "${outputPath}"`);
    
    // Verifica se o webpmux está disponível para embutir os metadados.
    let webpmuxPath = "";
    try {
      webpmuxPath = (await execProm("which webpmux")).stdout.trim();
      if (!webpmuxPath) throw new Error();
    } catch (e) {
      throw new Error("webpmux não encontrado. Por favor, instale-o no seu sistema.");
    }

    // Prepara os dados EXIF com os metadados do sticker.
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
    const exif = Buffer.concat([exifAttr, jsonBuff]);
    exif.writeUIntLE(jsonBuff.length, 14, 4);

    // Escreve os metadados EXIF em um arquivo temporário.
    const metaPath = path.join(tempDir, `meta_${Date.now()}.temp.exif`);
    fs.writeFileSync(metaPath, exif);

    // Utiliza o webpmux para embutir os metadados no sticker.
    await execProm(`"${webpmuxPath}" -set exif "${metaPath}" "${outputPath}" -o "${outputPath}"`);

    // Remove arquivo de metadados temporário.
    fs.unlinkSync(metaPath);

    // Em vez de ler e apagar o arquivo, retorna o caminho do arquivo final na pasta de temp.
    console.log("Sticker gerado:", outputPath);
    return outputPath;
   
  } catch (error) {
    throw new Error(`Erro ao criar sticker: ${error.message}`);
  }
}

module.exports = { createSticker };
