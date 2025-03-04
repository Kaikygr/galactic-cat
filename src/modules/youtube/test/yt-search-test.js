const { getVideosAsJson } = require("../yt-search");

const args = process.argv.slice(2);
if (!args.length) {
  console.log("Uso: node yt-search-test.js <query1> [query2] [...]");
  process.exit(1);
}

// Itera sobre todas as queries fornecidas
(async () => {
  for (const query of args) {
    console.log(`\nProcessando query: "${query}"`);
    const startTime = Date.now();
    const json = await getVideosAsJson(query);
    const endTime = Date.now();
    const processingTime = endTime - startTime;

    // Tenta parsear o JSON para contar os itens
    let count = "N/A";
    try {
      const result = JSON.parse(json);
      count = Array.isArray(result) ? result.length : "N/A";
    } catch (e) {
      // erro ao converter, mantemos N/A
    }

    console.log("Resultado:");
    console.log(json);
    console.log(`Itens retornados: ${count}`);
    console.log(`Tempo de processamento: ${processingTime} ms`);
  }
})().catch(err => {
  console.error("Erro na execução dos testes:", err);
  process.exit(1);
});
