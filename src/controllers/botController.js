/*
 * Arquivo responsável pelo gerenciamento geral do bot.
 * Recebe e processa todos os dados de #auth/connection.js, incluindo as informações
 * principais da sessão e dos usuários, além de outros eventos relevantes.
 *
 * Este arquivo deve utilizar módulos para o gerenciamento eficiente dos dados,
 * garantindo uma estrutura organizada e de fácil manutenção.
 */

require("dotenv").config();

const path = require("path");

// Importa os módulos de processamento de mensagens.
const { generateAIContent } = require(path.join(__dirname, "../modules/gemini/geminiModel"));
const { processSticker } = require(path.join(__dirname, "../modules/sticker/sticker"));
const { getFileBuffer } = require(path.join(__dirname, "../utils/functions"));

const ConfigfilePath = path.join(__dirname, "../config/options.json");
const config = require(ConfigfilePath);

const logger = require("../utils/logger");

const maxAttempts = 3;
const delayMs = 3000;
const sendTimeoutMs = 5000;
const WA_DEFAULT_EPHEMERAL = 86400;

const { preProcessMessage, processPrefix, getQuotedChecks, getExpiration } = require(path.join(__dirname, "./messageTypeController"));

async function handleWhatsAppUpdate(upsert, client) {
  async function retryOperation(operation, options = {}) {
    const { retries = 3, delay = 1000, timeout = 5000 } = options;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await Promise.race([operation(), new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeout))]);
      } catch (error) {
        if (attempt === retries) throw error;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  for (const info of upsert?.messages || []) {
    if (!info || !info.key || !info.message) continue;
    if (info.key.fromMe) continue; // Ignorar mensagens enviadas pelo próprio bot
console.log(JSON.stringify(info, null, 2));
    try {
      await client.readMessages([info.key]);
      logger.info(`Mensagem marcada como lida: ${info.key.participant || info.key.remoteJid}`);
    } catch (error) {
      logger.warn("Erro ao marcar a mensagem como lida:", error);
    }

    const from = info.key.remoteJid;
    const isGroup = from.endsWith("@g.us");
    const sender = isGroup ? info.key.participant : info.key.remoteJid;
    const expirationMessage = getExpiration(info) === null ? null : getExpiration(info);

    const { type, body, isMedia } = preProcessMessage(info);
    const prefixResult = processPrefix(body, process.env.GLOBAL_PREFIX);
    if (!prefixResult) continue;

    const { comando, args } = prefixResult;
    const text = args.join(" ");
    const content = JSON.stringify(info.message);

    const isOwner = sender === config.owner.number;

    const { isQuotedMsg, isQuotedImage, isQuotedVideo, isQuotedDocument, isQuotedAudio, isQuotedSticker, isQuotedContact, isQuotedLocation, isQuotedProduct } = getQuotedChecks(type, content);
    function getGroupAdmins(participants) {
      const admins = [];
      for (const participant of participants) {
        if (participant.admin === "admin" || participant.admin === "superadmin") {
          admins.push(participant.id);
        }
      }
      return admins;
    }
    const groupMeta = isGroup ? await client.groupMetadata(from) : null;
    const groupFormattedData = groupMeta ? JSON.stringify(groupMeta, null, 2) : null;
    const isGroupAdmin = isGroup ? getGroupAdmins(groupMeta.participants).includes(sender) : false;

    const sendWithRetry = async (target, text, options = {}) => {
      if (typeof text !== "string") {
        text = String(text);
      }
      text = text.trim();

      if (!text) {
        logger.warn("texto vazio após sanitização");
        return;
      }

      try {
        await retryOperation(() => client.sendMessage(target, { text }, options), {
          retries: maxAttempts,
          delay: delayMs,
          timeout: sendTimeoutMs,
        });
      } catch (error) {
        logger.error(`Todas as tentativas de envio falharam para ${target}.`, error);
      }
    };

    const userMessageReport = async texto => {
      await sendWithRetry(from, texto, { quoted: info, ephemeralExpiration: WA_DEFAULT_EPHEMERAL });
    };

    const ownerReport = async message => {
      const sanitizedMessage = String(message).trim();
      if (!sanitizedMessage) {
        logger.warn("texto vazio após sanitização");
        return;
      }

      const formattedMessage = JSON.stringify(sanitizedMessage, null, 2);
      await sendWithRetry(config.owner.number, formattedMessage, {
        ephemeralExpiration: WA_DEFAULT_EPHEMERAL,
      });
    };

    switch (comando) {
      case "cat":
      case "gemini":
        {
          try {
            const prompt = args.join(" ");
            const response = await generateAIContent(sender, prompt);
            await client.sendMessage(from, { text: response }, { quoted: info, ephemeralExpiration: expirationMessage });
          } catch (error) {
            logger.error(error);
            await client.sendMessage(
              from,
              {
                text: `⚠️ Não foi possível gerar o conteúdo com o modelo Gemini. Por favor, tente novamente. Caso o problema persista, entre em contato com o desenvolvedor: ${config.owner.phone} 📞`,
              },
              { quoted: info, ephemeralExpiration: expirationMessage }
            );
            await client.sendMessage(
              config.owner.number,
              {
                text: `⚠️ Um erro ocorreu ao gerar o conteúdo:\n\n${JSON.stringify(error, null, 2)}\n\n📩 Verifique e tome as providências necessárias.`,
              },
              { quoted: info, ephemeralExpiration: expirationMessage }
            );
          }
        }
        break;

      case "sticker":
      case "s": {
        await processSticker(client, info, sender, from, text, isMedia, isQuotedVideo, isQuotedImage, config, getFileBuffer);
        break;
      }

      
      
    }
  }
}

module.exports = handleWhatsAppUpdate;