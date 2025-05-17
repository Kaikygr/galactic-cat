const fs = require('fs');
const path = require('path');
const util = require('util');
const { exec } = require('child_process');
const execProm = util.promisify(exec);
const config = require('../../config/options.json');

const { getFileBuffer } = require('../../utils/getFileBuffer');
const logger = require('../../utils/logger');

const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

async function processSticker(client, info, expirationMessage, sender, from, text, isMedia, isQuotedVideo, isQuotedImage) {
  try {
    logger.info(`🎨✨ [ Criando Sticker ] Processando pedido para o usuário: ${sender.split('@')[0]} 🚀🛠️`);

    const caminhosPossiveis = {
      image: [info.message?.imageMessage, info.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage, info.message?.extendedTextMessage?.contextInfo?.quotedMessage?.viewOnceMessage?.message?.imageMessage],
      video: [info.message?.videoMessage, info.message?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage, info.message?.extendedTextMessage?.contextInfo?.quotedMessage?.viewOnceMessage?.message?.videoMessage],
      sticker: [info.message?.stickerMessage, info.message?.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage],
      document: [info.message?.documentMessage, info.message?.extendedTextMessage?.contextInfo?.quotedMessage?.documentWithCaptionMessage?.message?.documentMessage, info?.message.extendedTextMessage?.contextInfo.quotedMessage?.documentMessage],
    };

    let tipoMidia = null;
    let encmedia = null;

    for (const [tipo, caminhos] of Object.entries(caminhosPossiveis)) {
      for (const caminho of caminhos) {
        if (caminho) {
          tipoMidia = tipo;
          encmedia = caminho;
          break;
        }
      }
      if (encmedia) break;
    }

    if (!encmedia) {
      await client.sendMessage(from, { react: { text: '⚠️', key: info.key } });
      const noMediaHelpText =
        '⚠️ *Nenhuma Mídia Detectada para Sticker*\n\n' +
        'Para criar um sticker, por favor, envie uma imagem/vídeo ou responda a uma mensagem contendo a mídia desejada utilizando o comando `.sticker`.\n\n' +
        'ℹ️ *Dicas e Informações Adicionais:*\n\n' +
        '🔹 *Tipos de Mídia Suportados:*\n' +
        '  - Imagens (JPG, PNG, etc.)\n' +
        '  - Vídeos curtos (MP4, etc.)\n' +
        '  - Stickers existentes (para adicionar metadados)\n\n' +
        '🔹 *Recomendações para Vídeos:*\n' +
        '  - Duração ideal: até 5 segundos.\n' +
        '  - Tamanho máximo: 1.5 MB (arquivos maiores podem não ser processados).\n' +
        '  - Vídeos de alta definição podem levar mais tempo ou falhar; prefira resoluções menores se encontrar problemas.\n\n' +
        '📏 *Formato Final do Sticker:*\n' +
        '  - Todas as mídias são convertidas para o formato WebP e redimensionadas para 512x512 pixels.\n\n' +
        '📝 *Personalização de Nome do Pacote e Autor:*\n' +
        '  - Você pode definir o nome do pacote de stickers e o nome do autor que aparecerão nas informações do sticker.\n' +
        '  - Use o comando: `.sticker Nome do Pacote | Nome do Autor`\n' +
        '  - *Exemplo:* `.sticker Meus Gatinhos | Por #nome`\n' +
        '  - Se apenas um texto for fornecido (sem o `|`), ele será usado como "Nome do Pacote".\n' +
        '  - *Variáveis dinâmicas:* `#nome` (seu nome de usuário no WhatsApp), `#id` (seu número de telefone), `#data` (data atual).\n' +
        '  - Suas preferências de nome e autor são salvas e reutilizadas para stickers futuros. Enviar um novo texto com o comando atualizará essas preferências.\n\n' +
        'Por favor, tente novamente seguindo estas orientações.';
      await client.sendMessage(from, { text: noMediaHelpText }, { quoted: info, ephemeralExpiration: expirationMessage });
      await client.sendMessage(
        config.owner.number,
        {
          text: `⚠️ *Usuário com possível dificuldade no comando de sticker!*\n\n👤 *User:* ${sender.split('@')[0]}\n📎 *Tipo de mídia:* ${tipoMidia !== null ? tipoMidia : 'Não foi fornecida mídia para o processo.'}\n📝 *Texto:* ${text || 'Nenhum texto informado.'}\n\n🚨 *Verifique o conteúdo acima para análise.*`,
        },
        { quoted: info, ephemeralExpiration: expirationMessage },
      );

      return;
    }

    await client.sendMessage(from, { react: { text: '⏳', key: info.key } });
    await client.sendMessage(
      from,
      {
        text: '⚙️ Processando sua solicitação de sticker. Aguarde um momento...',
      },
      { quoted: info, ephemeralExpiration: expirationMessage },
    );

    if (tipoMidia === 'document') {
      const mimetype = encmedia.mimetype || '';
      if (mimetype.startsWith('image/')) {
        tipoMidia = 'image';
      } else if (mimetype.startsWith('video/')) {
        tipoMidia = 'video';
      } else {
        await client.sendMessage(from, { react: { text: '⚠️', key: info.key } });
        await client.sendMessage(
          from,
          {
            text: '⚠️ *Tipo de Documento Não Suportado*\n\n' + 'O arquivo que você enviou como documento não pôde ser identificado como uma imagem ou vídeo compatível.\n' + 'Para criar stickers a partir de documentos, por favor, certifique-se de que o arquivo seja um formato de imagem (como .jpg, .png) ou vídeo (como .mp4).\n\n' + 'Tente enviar a mídia diretamente como imagem/vídeo ou verifique o tipo de arquivo do documento.',
          },
          { quoted: info, ephemeralExpiration: expirationMessage },
        );
        return;
      }
    }

    const fileLength = encmedia?.fileLength || 0;
    const maxFileSize = 1.5 * 1024 * 1024;

    if ((tipoMidia === 'video' || tipoMidia === 'sticker') && fileLength > maxFileSize) {
      await client.sendMessage(from, { react: { text: '⚠️', key: info.key } });
      await client.sendMessage(
        from,
        {
          text: '⚠️ *Arquivo Excede o Limite de Tamanho*\n\n' + 'O vídeo ou sticker que você enviou é maior que o limite permitido de *1,5 MB*.\n' + 'Arquivos grandes podem causar problemas de processamento e uso excessivo de dados.\n\n' + 'Por favor, envie uma versão menor do arquivo. Para vídeos, considere reduzir a duração ou a resolução.',
        },
        { quoted: info, ephemeralExpiration: expirationMessage },
      );
      return;
    }

    let mediaExtension = '';
    let processWithFfmpeg = true;
    let mediaBuffer;

    try {
      mediaBuffer = await getFileBuffer(encmedia, tipoMidia);

      switch (tipoMidia) {
        case 'image':
          mediaExtension = '.jpg';
          break;
        case 'video':
          mediaExtension = '.mp4';
          break;
        case 'sticker':
          mediaExtension = '.webp';
          processWithFfmpeg = false;
          break;
      }
    } catch (e) {
      if (e.message.includes('bad decrypt')) {
        logger.error('Erro ao obter mídia: problema de descriptografia', e);
        await client.sendMessage(from, { react: { text: '❌', key: info.key } });
        await client.sendMessage(
          from,
          {
            text: '❌ *Erro ao Acessar Mídia Criptografada*\n\n' + 'Não foi possível processar a mídia enviada devido a um erro de descriptografia. ' + 'Isso geralmente acontece com mídias que foram encaminhadas muitas vezes, mídias "ver uma vez" que já expiraram, ou arquivos corrompidos.\n\n' + 'Por favor, tente as seguintes opções:\n' + '- Envie a mídia original novamente (não encaminhada).\n' + '- Peça ao remetente original para enviar a mídia diretamente para você.\n' + '- Tente com um arquivo de mídia diferente.',
          },
          { quoted: info, ephemeralExpiration: expirationMessage },
        );
      } else {
        logger.error('Erro ao obter mídia:', e);
        await client.sendMessage(from, { react: { text: '❌', key: info.key } });
        await client.sendMessage(
          from,
          {
            text: '❌ *Erro ao Carregar a Mídia*\n\n' + 'Houve uma falha ao tentar carregar os dados da mídia que você enviou. ' + 'Isso pode ser causado por um formato de arquivo não suportado, arquivo corrompido, ou um problema temporário de rede.\n\n' + 'Por favor, verifique se o arquivo está em um formato comum (imagem ou vídeo) e tente novamente. Se o problema persistir, tente com uma mídia diferente.',
          },
          { quoted: info, ephemeralExpiration: expirationMessage },
        );
      }
      return;
    }

    const mediaPath = path.join(tempDir, `temp_file_${Date.now()}${mediaExtension}`);
    fs.writeFileSync(mediaPath, mediaBuffer);

    if (!fs.existsSync(mediaPath)) {
      logger.error(`Falha ao criar o arquivo de mídia temporário em: ${mediaPath}`);
      await client.sendMessage(from, { react: { text: '❌', key: info.key } });
      await client.sendMessage(
        from,
        {
          text: '❌ *Erro Interno Durante a Preparação*\n\n' + 'Ocorreu uma falha técnica ao tentar criar os arquivos temporários necessários para o processamento do seu sticker. ' + 'Nossa equipe técnica foi notificada sobre este incidente.\n\n' + 'Pedimos desculpas pelo inconveniente. Por favor, tente novamente em alguns minutos.',
        },
        { quoted: info, ephemeralExpiration: expirationMessage },
      );
      return;
    }
    let outputPath = path.join(tempDir, `sticker_${Date.now()}.webp`);
    if (processWithFfmpeg) {
      const filtro = tipoMidia === 'video' ? 'fps=10,scale=512:512' : 'scale=512:512';
      await execProm(`ffmpeg -i "${mediaPath}" -vcodec libwebp -lossless 1 -loop 0 -preset default -an -vf "${filtro}" "${outputPath}"`);
    } else {
      fs.copyFileSync(mediaPath, outputPath);
    }

    const formattedSender = sender.replace(/@s\.whatsapp\.net$/, '');
    const prefsPath = path.join(__dirname, 'data', 'stickerPrefs.json');
    let stickerPrefs = {};
    if (fs.existsSync(prefsPath)) {
      try {
        stickerPrefs = JSON.parse(fs.readFileSync(prefsPath, 'utf-8'));
      } catch (err) {
        stickerPrefs = {};
      }
    }
    const key = formattedSender;

    let defaultComputedName = `👤 Usuário: ${info.pushName}\n🆔 ID: ${formattedSender}\n📅 Data: ${new Date().toLocaleDateString('pt-BR')}`;
    let defaultComputedPublisher = `\n\n👑 Criador: https://bit.ly/m/Kaally`;

    let storedName = stickerPrefs[key] && stickerPrefs[key].stickerPackName ? stickerPrefs[key].stickerPackName : defaultComputedName;
    let storedPublisher = stickerPrefs[key] && stickerPrefs[key].stickerPackPublisher ? stickerPrefs[key].stickerPackPublisher : defaultComputedPublisher;

    let stickerPackName, stickerPackPublisher;
    if (text && text.trim()) {
      if (text.includes('|')) {
        const parts = text.split('|').map((p) => p.trim());
        const newName = parts[0] !== '' ? parts[0] : storedName;
        const newPublisher = parts[1] !== '' ? parts[1] : storedPublisher;
        stickerPackName = newName;
        stickerPackPublisher = newPublisher;
        stickerPrefs[key] = {
          stickerPackName: newName,
          stickerPackPublisher: newPublisher,
        };
        const prefsDir = path.dirname(prefsPath);
        if (!fs.existsSync(prefsDir)) {
          fs.mkdirSync(prefsDir, { recursive: true });
          logger.info(`Diretório de preferências criado em: ${prefsDir}`);
        }
        fs.writeFileSync(prefsPath, JSON.stringify(stickerPrefs, null, 2));
      } else {
        const newName = text.trim() !== '' ? text.trim() : null;
        stickerPackName = newName !== null ? newName : defaultComputedName;
        stickerPackPublisher = storedPublisher || defaultComputedPublisher;
        stickerPrefs[key] = {
          stickerPackName: newName,
          stickerPackPublisher: storedPublisher,
        };
        const prefsDir = path.dirname(prefsPath);
        if (!fs.existsSync(prefsDir)) {
          fs.mkdirSync(prefsDir, { recursive: true });
          logger.info(`Diretório de preferências criado em: ${prefsDir}`);
        }
        fs.writeFileSync(prefsPath, JSON.stringify(stickerPrefs, null, 2));
      }
    } else {
      stickerPackName = storedName;
      stickerPackPublisher = storedPublisher;
    }

    const finalPackName = stickerPackName !== null ? stickerPackName : defaultComputedName;
    const finalPackPublisher = stickerPackPublisher !== null ? stickerPackPublisher : defaultComputedPublisher;

    const replacedName = finalPackName.replace(/#nome/g, info.pushName).replace(/#id/g, formattedSender).replace(/#data/g, new Date().toLocaleDateString('pt-BR'));
    const replacedPublisher = finalPackPublisher.replace(/#nome/g, info.pushName).replace(/#id/g, formattedSender).replace(/#data/g, new Date().toLocaleDateString('pt-BR'));

    const json = {
      'sticker-pack-name': replacedName,
      'sticker-pack-publisher': replacedPublisher,
    };

    const exifAttr = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
    const jsonBuff = Buffer.from(JSON.stringify(json), 'utf-8');
    const exifBuffer = Buffer.concat([exifAttr, jsonBuff]);
    exifBuffer.writeUIntLE(jsonBuff.length, 14, 4);
    const metaPath = path.join(tempDir, `meta_${Date.now()}.temp.exif`);
    fs.writeFileSync(metaPath, exifBuffer);

    let webpmuxPath = '';

    webpmuxPath = (await execProm('which webpmux')).stdout.trim();

    await execProm(`"${webpmuxPath}" -set exif "${metaPath}" "${outputPath}" -o "${outputPath}"`);
    fs.unlinkSync(metaPath);
    if (!fs.existsSync(outputPath)) {
      logger.error(`Falha ao criar o arquivo de sticker final em: ${outputPath} após webpmux`);
      throw new Error(`Arquivo de sticker não encontrado após processamento com webpmux: ${outputPath}`);
    }

    await client.sendMessage(from, { react: { text: '🐈‍⬛', key: info.key } });
    await client.sendMessage(from, { sticker: fs.readFileSync(outputPath) }, { quoted: info, ephemeralExpiration: expirationMessage });
    fs.unlinkSync(mediaPath);
  } catch (error) {
    await client.sendMessage(from, { react: { text: '❌', key: info.key } });
    await client.sendMessage(
      from,
      {
        text: '❌ *Falha Inesperada no Processamento do Sticker*\n\n' + 'Lamentamos, mas um erro inesperado ocorreu enquanto seu sticker estava sendo criado. ' + 'Isso pode ser devido a um problema com o formato da mídia que não foi detectado anteriormente, ou uma instabilidade momentânea no sistema de processamento.\n\n' + 'Recomendamos verificar se a mídia está em um formato padrão (JPG, PNG para imagens; MP4 para vídeos curtos) e tentar novamente. ' + 'Se o erro continuar, por favor, aguarde um pouco antes de uma nova tentativa ou contate o suporte se disponível.',
      },
      { quoted: info, ephemeralExpiration: expirationMessage },
    );
    logger.error('Erro ao processar sticker:', error);
    await client.sendMessage(
      config.owner.number,
      {
        text: `❌ *Erro ao processar sticker!*\n\nOcorreu um problema ao tentar processar a solicitação de ${sender.split('@')[0]}.\n\n\`\`\`${error}\`\`\``,
      },
      { quoted: info, ephemeralExpiration: expirationMessage },
    );
    return;
  }
}

module.exports = { processSticker };
