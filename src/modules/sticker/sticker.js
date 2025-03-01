const fs = require('fs');
const path = require('path');
const util = require('util');
const { exec } = require('child_process');
const execProm = util.promisify(exec);

const tempDir = path.join(__dirname, "..", "..", "temp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

async function createSticker(mediaPath, userLeg = "User", ownerLeg = "Owner", size = "512:512") {
  try {
    console.log(mediaPath);
    const outputPath = path.join(tempDir, `sticker_${Date.now()}.webp`);
    
    const sizeParam = (size !== "original") ? ` -s ${size}` : "";
    
    await execProm(`ffmpeg -i "${mediaPath}" -vcodec libwebp -filter:v fps=fps=15 -lossless 1 -loop 0 -preset default -an -vsync 0${sizeParam} "${outputPath}"`);
  
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

    const metaPath = path.join(tempDir, `meta_${Date.now()}.temp.exif`);
    fs.writeFileSync(metaPath, exifBuffer);

    let webpmuxPath = "";
    try {
      webpmuxPath = (await execProm("which webpmux")).stdout.trim();
      if (!webpmuxPath) throw new Error("webpmux não encontrado.");
    } catch (e) {
      throw new Error("webpmux não encontrado. Por favor, instale-o no seu sistema.");
    }
    
    await execProm(`"${webpmuxPath}" -set exif "${metaPath}" "${outputPath}" -o "${outputPath}"`);
    
    fs.unlinkSync(metaPath);
    
    console.log("Sticker gerado:", outputPath);
    return outputPath;
   
  } catch (error) {
    throw new Error(`Erro ao criar sticker: ${error.message}`);
  }
}

module.exports = { createSticker };
