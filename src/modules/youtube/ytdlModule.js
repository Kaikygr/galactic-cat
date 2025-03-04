const yts = require("yt-search");

async function getVideosAsJson(query) {
  try {
    if (typeof query !== "string") {
      throw new Error("A query deve ser uma string.");
    }
    const treatedQuery = query.trim();
    if (treatedQuery.length === 0) {
      throw new Error("A query não pode estar vazia.");
    }

    const r = await yts(treatedQuery);

    if (!r?.videos || r.videos.length === 0) {
      throw new Error("Nenhum vídeo encontrado.");
    }

    const videosSlice = r.videos.slice(0, 1);
    return JSON.stringify(videosSlice, null, 2);
  } catch (error) {
    console.error("Erro ao buscar vídeos:", error);
    return JSON.stringify({ error: error.message }, null, 2);
  }
}

module.exports = {
  getVideosAsJson
};
