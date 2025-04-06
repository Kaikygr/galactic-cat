const { distubeProcessDownload } = require("./distube");

(async () => {
  const url = "https://youtu.be/U4F2P6IOnsM?si=j8J7cER30r1rPrpJ";

  try {
    // Teste para baixar somente o áudio
    const audioResult = await distubeProcessDownload(url, "meu_audio", "audio");
    console.log("Áudio baixado com sucesso:", audioResult);

    // Teste para baixar vídeo com áudio mesclado
    const videoResult = await distubeProcessDownload(url, "meu_video", "video");
    console.log("Vídeo baixado com sucesso:", videoResult);
  } catch (error) {
    console.error("Erro durante o download:", error);
  }
})();
