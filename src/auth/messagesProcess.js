// Template de função async

async function messagesProcess(data) {
  try {
    // console.log("Data recebido:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Ocorreu um erro:", error);
    throw error;
  }
}

module.exports = { messagesProcess };
