

# Módulo Gemini

Este módulo integra a API do Google Generative AI para fornecer geração de conteúdo com base no texto de entrada.

## Sumário
- [Introdução](#introdução)
- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
- [Configuração](#configuração)
- [Exemplo de Uso](#exemplo-de-uso)
- [Detalhes Técnicos](#detalhes-técnicos)
- [Licença](#licença)

## Introdução
O módulo Gemini utiliza a biblioteca `@google/generative-ai` para processar e gerar conteúdo a partir de um texto fornecido. Ele lida com a criação do arquivo de configuração e validação dos parâmetros essenciais, como a chave de API.

## Pré-requisitos
- Node.js instalado.
- Conta e chave de API do Google Generative AI.
- As devidas permissões de escrita e leitura no diretório de dados do módulo.

## Instalação
Navegue até a pasta do projeto e execute:
```bash
npm install
```
Certifique-se de que o pacote `@google/generative-ai` esteja listado nas dependências.

## Configuração
Ao executar o módulo pela primeira vez, o arquivo de configuração `/modules/gemini/data/config.json` será criado automaticamente, se inexistente.  
Edite o arquivo com a sua chave de API e outras configurações:
```json
// Exemplo de config.json
{
  "apiKey": "SUA_CHAVE_DE_API",
  "model": "gemini-pro",
  "safetySettings": [
    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"}
  ]
}
```

## Exemplo de Uso
No seu código, importe e utilize a função principal do módulo:
```javascript
// Exemplo de uso
const geminiAIModel = require("./modules/gemini/index.js");

(async () => {
  const texto = "Seu texto para gerar conteúdo...";
  const resultado = await geminiAIModel(texto);

  if (resultado.status === "success") {
    console.log("Resposta:", resultado.response);
  } else {
    console.error("Erro:", resultado.message);
  }
})();
```

## Detalhes Técnicos
- **Arquivo Principal:** `/modules/gemini/index.js`  
  Responsável por carregar a configuração, validar o input e interagir com a API do Google Generative AI.
- **Configuração Automática:** Se o arquivo de configuração não existir, um arquivo padrão é criado.
- **Validações:** São realizadas verificações para garantir que a chave da API e o conteúdo do texto sejam válidos.

## Licença
Este projeto utiliza uma licença [MIT](LICENSE).
