# Sticker Module

Este módulo é responsável por processar imagens e vídeos enviados pelo usuário e convertê-los em stickers para o WhatsApp.

## Arquivo: `sticker.js`

### Importação dos módulos essenciais

```javascript
const fs = require("fs");
const path = require("path");
const util = require("util");
const { exec } = require("child_process");
const execProm = util.promisify(exec);
const { getFileBuffer } = require("../../utils/functions");
```

### Configuração do diretório temporário

```javascript
const tempDir = path.join(__dirname, "..", "..", "temp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}
```

### Função principal: `processSticker`

Esta função processa a mídia enviada pelo usuário e a converte em um sticker.

```javascript
async function processSticker(client, info, sender, from, text, isMedia, isQuotedVideo, isQuotedImage, config, getFileBuffer) {
  try {
    let filtro = "fps=10,scale=512:512";

    const userMessageReport = async msg => {
      await client.sendMessage(from, { text: msg }, { quoted: info });
    };

    let encmedia, mediaBuffer, mediaExtension;
    if ((isMedia && info.message.videoMessage) || isQuotedVideo) {
      const videoDuration = isMedia && info.message.videoMessage ? info.message.videoMessage.seconds : info.message.extendedTextMessage.contextInfo.quotedMessage.videoMessage.seconds;
      if (videoDuration >= (isQuotedVideo ? 35 : 10)) {
        return userMessageReport("Vídeo muito longo para sticker animada.");
      }
      encmedia = isQuotedVideo ? info.message.extendedTextMessage.contextInfo.quotedMessage.videoMessage : info.message.videoMessage;
      mediaBuffer = await getFileBuffer(encmedia, "video");
      mediaExtension = ".mp4";
    } else if ((isMedia && !info.message.videoMessage) || isQuotedImage) {
      encmedia = isQuotedImage ? info.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage : info.message.imageMessage;
      mediaBuffer = await getFileBuffer(encmedia, "image");
      mediaExtension = ".jpg";
    } else {
      return userMessageReport("Envie ou cite uma imagem ou vídeo para criar o sticker.");
    }

    if (mediaExtension === ".jpg") {
      filtro = "scale=512:512";
    }

    const mediaPath = path.join(tempDir, `temp_file_${Date.now()}${mediaExtension}`);
    fs.writeFileSync(mediaPath, mediaBuffer);

    const outputPath = path.join(tempDir, `sticker_${Date.now()}.webp`);
    await execProm(`ffmpeg -i "${mediaPath}" -vcodec libwebp -lossless 1 -loop 0 -preset default -an -vf "${filtro}" "${outputPath}"`);

    const json = {
      "sticker-pack-name": `👤 User: ${info.pushName || sender}`,
      "sticker-pack-publisher": `👑 Owner: https://bit.ly/m/Kaally`,
    };
    const exifAttr = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
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

    await client.sendMessage(from, { sticker: fs.readFileSync(outputPath) }, { quoted: info });
    fs.unlinkSync(mediaPath);
  } catch (error) {
    await client.sendMessage(from, { text: "Error durante o processamento." }, { quoted: info });
    console.log(error);
  }
}

module.exports = { processSticker };
```

### Explicação

1. **Importação dos módulos essenciais**: Importa módulos necessários como `fs`, `path`, `util`, e `child_process`.
2. **Configuração do diretório temporário**: Cria um diretório temporário para armazenar arquivos temporários.
3. **Função `processSticker`**:
   - Verifica se a mídia enviada é um vídeo ou uma imagem.
   - Extrai o buffer do arquivo de mídia.
   - Converte a mídia em um sticker usando `ffmpeg`.
   - Adiciona metadados ao sticker usando `webpmux`.
   - Envia o sticker de volta ao usuário.
   - Remove arquivos temporários.

### Dependências

- `ffmpeg`: Utilizado para converter vídeos e imagens em stickers.
- `webpmux`: Utilizado para adicionar metadados aos stickers.

### Como usar

1. Certifique-se de ter `ffmpeg` e `webpmux` instalados no seu sistema.
2. Importe e utilize a função `processSticker` no seu projeto.

```javascript
const { processSticker } = require("./src/modules/sticker/sticker");
```
