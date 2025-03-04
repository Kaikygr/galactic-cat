const { getVideosAsJson } = require("./yt-search");
const axios = require("axios");

async function getVideoInfo(client, info, sender, from, text, userMessageReport, ownerReport, logger) {
  try {
    if (typeof text !== "string") {
      throw new Error("A query deve ser uma string.");
    }

    if (text.trim().length === 0) {
      throw new Error("O termo a ser pesquisado não pode estar vazio.");
    }

    // Chama a função getVideosAsJson e converte o resultado para criar um objeto com a propriedade 'videos'
    const videosJson = await getVideosAsJson(text);
    let videosArray;
    try {
      videosArray = JSON.parse(videosJson);
    } catch (parseError) {
      throw new Error("Erro ao processar os vídeos retornados.");
    }
    const search = { videos: videosArray };
    console.log(search);

    if (!search.videos || search.videos.length === 0) {
      throw new Error("Nenhum vídeo encontrado.");
    }

    const firstVideo = search.videos[0];
    const parseResults = `🎥 Tipo: ${firstVideo.type}
▶️ ID do Vídeo: ${firstVideo.videoId}
📌 Título: ${firstVideo.title}
🔗 Link: ${firstVideo.url}
⏳ Duração: ${firstVideo.timestamp}
👀 Visualizações: ${firstVideo.views}
📅 Publicado há: ${firstVideo.ago}
📢 Canal: ${firstVideo.author.name}
🔗 Link do Canal: ${firstVideo.author.url}`;

    // Obtém a imagem como buffer a partir do link
    const response = await axios.get(firstVideo.image, { responseType: "arraybuffer" });
    const imageBuffer = Buffer.from(response.data);

    // Envio da mensagem com o buffer da imagem e a legenda
    await client.sendMessage(from, {
      image: imageBuffer,
      caption: parseResults
    });
  } catch (error) {
    logger.error("Erro ao buscar vídeos:", error);
    ownerReport(`Erro ao buscar vídeos: ${error.message}`);
    await userMessageReport("Erro ao buscar vídeos: ocorreu um erro inesperado, tente novamente mais tarde");
  }
}

module.exports = {
  getVideoInfo
};
