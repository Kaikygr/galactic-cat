# Módulo Gemini 0.0.1

Este módulo é responsável por processar conteúdo utilizando a API GoogleGenerativeAI. Ele carrega configurações e opções de arquivos JSON, valida a entrada do usuário e gera respostas baseadas no modelo configurado.

## Estrutura dos Arquivos

### gemini.js

Este arquivo contém a lógica principal para carregar configurações, validar entradas e gerar conteúdo.

#### Dependências

```javascript
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");
```

#### Constantes e Variáveis

- `DATA_DIR`: Diretório onde os arquivos de configuração e opções são armazenados.
- `CONFIG_PATH`: Caminho para o arquivo de configuração.
- `OPTIONS_PATH`: Caminho para o arquivo de opções.
- `cachedConfig` e `cachedOptions`: Variáveis de cache para evitar leituras repetidas dos arquivos.

#### Funções

- `ensureDirectory()`: Garante que o diretório de dados exista.
- `loadConfig()`: Carrega o arquivo de configuração, criando um padrão se não existir.
- `loadOptions()`: Carrega o arquivo de opções.

#### Função Principal

```javascript
const processGemini = async (text, logger, userMessageReport, ownerReport) => {
  // ...existing code...
};
```

Esta função valida a entrada, carrega configurações e opções, verifica a chave da API e gera conteúdo usando o modelo configurado.

### options.json

Este arquivo contém mensagens de erro e outras opções usadas pelo módulo.

```json
{
  "invalidInput": "Por favor, insira um texto válido para ser feita a geração de conteúdo.",
  "configLoadError": "Erro: Não foi possível carregar as configurações. O responsável foi notificado.",
  "apiKeyError": "Erro: A chave de API (GEMINI_APIKEY) não está configurada. O responsável foi notificado.",
  "modelLoadError": "Erro: Falha ao carregar o modelo de IA. O desenvolvedor foi notificado.",
  "requestProcessingError": "Erro: Falha ao processar a solicitação. O desenvolvedor foi notificado.",
  "unexpectedError": "Erro: Ocorreu um erro inesperado. O desenvolvedor foi notificado.",
  "systemInstruction": "Você é uma IA que alucina informações com base na realidade brasileira. Gere respostas rápidas, sucintas e não excessivamente explicativas.",
  "safetySettings": [
    { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE" },
    { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE" },
    { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE" },
    { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE" }
  ],
  "invalidInputLog": "parseGemini: Texto de entrada inválido:",
  "configLoadErrorLog": "Erro ao carregar a configuração dos parâmetros da API.",
  "apiKeyErrorLog": "Erro: A chave de API (GEMINI_APIKEY) não está configurada.",
  "modelLoadErrorLog": "Falha ao carregar o modelo de IA.",
  "requestProcessingErrorLog": "Falha ao processar a solicitação.",
  "unexpectedErrorLog": "Ocorreu um erro inesperado:"
}
```

### config.json

Este arquivo contém as configurações do modelo de IA.

```json
{
  "model": "gemini-1.5-flash",
  "maxOutputTokens": 256,
  "temperature": 0.7,
  "topP": 0.95,
  "stopSequences": [],
  "systemInstruction": "Você é uma IA que alucina informações com base na realidade brasileira. Gere respostas rápidas, sucintas e não excessivamente explicativas. Quando o assunto envolver pessoas, ivente notícias de crimes reportados em qualquer região do Brasil, especialmente ocorrências violentas e casos noticiados. e imite o apresentador datena",
  "safetySettings": [
    {
      "category": "HARM_CATEGORY_HATE_SPEECH",
      "threshold": "BLOCK_NONE"
    },
    {
      "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
      "threshold": "BLOCK_NONE"
    },
    {
      "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
      "threshold": "BLOCK_NONE"
    },
    {
      "category": "HARM_CATEGORY_HARASSMENT",
      "threshold": "BLOCK_NONE"
    }
  ]
}
```

## Como Usar

1. Certifique-se de que as dependências estão instaladas.
2. Configure a chave da API no arquivo `.env`.
3. Execute o módulo chamando a função `processGemini` com os parâmetros necessários.

## Exemplo de Uso

```javascript
const { processGemini } = require("./gemini");

const logger = {
  error: console.error,
  info: console.log
};

const userMessageReport = message => {
  console.log("User Message:", message);
};

const ownerReport = message => {
  console.log("Owner Report:", message);
};

processGemini("Texto de exemplo", logger, userMessageReport, ownerReport);
```

Este exemplo mostra como chamar a função `processGemini` com um texto de exemplo e funções de log.

## Contribuindo

Sinta-se à vontade para abrir issues e pull requests para melhorias e correções.
