# Galactic-Cat - Chatbot para WhatsApp

<p align="center">
  <img src="https://static.tumblr.com/f76d0c37c94757b5b0c3cceb73a1664b/ftrdqzb/cZSorgwba/tumblr_static_tumblr_static_akjaybqi5ggg8o4sgwowggogc_640.gif" alt="Banner">
</p>

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/Node.js-%3E=14-blue.svg)](https://nodejs.org/)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)]()
[![Downloads](https://img.shields.io/badge/downloads-1K+-blue.svg)]()

## Visão Geral

_Galactic-Cat_ é um chatbot open-source desenvolvido em **Node.js** para integrar com o **WhatsApp**. Ele utiliza a API [@whiskeysockets/baileys](https://www.npmjs.com/package/@whiskeysockets/baileys) para gerenciar conexões, envio e recebimento de mensagens, e inclui funcionalidades avançadas como:

- **Envio de mensagens automáticas** e personalizadas.
- **Conversão de mídias para stickers** com metadados customizados (vide [`createSticker`](src/modules/sticker/sticker.js)).
- **Integração com modelos de Inteligência Artificial**, como o [Gemini AI](src/modules/gemini/index.js).

## Funcionalidades

- **Envio Automático e Interativo:**  
  Responde automaticamente às mensagens com base nos comandos processados em [`botController.js`](src/controllers/botController.js).

- **Geração de Stickers:**  
  Converte imagens e vídeos em stickers WebP, aplicando metadados EXIF customizados. Veja como a função [`createSticker`](src/modules/sticker/sticker.js) opera.

- **Integração com WhatsApp:**  
  Gerencia a conexão, autenticação e reconexão através do [`connection.js`](src/auth/connection.js) e utiliza a biblioteca Baileys para comunicação robusta.

- **Gerenciamento de Mídias e Mensagens:**  
  Processa e formata mensagens usando funções auxiliares em [`messageController.js`](src/controllers/messageController.js) e [`functions.js`](src/utils/functions.js).

- **Métricas e Logs:**  
  Registra métricas de performance (uptime, uso de memória) e eventos de conexão em arquivos de log (_logs/connection.log_).

## Tecnologias Utilizadas

- **Node.js:** Plataforma para execução do JavaScript.
- **@whiskeysockets/baileys:** API para integração com WhatsApp.
- **SQLite:** Banco de dados leve para armazenamento de interações.
- **FFmpeg & Webpmux:** Utilizados na conversão de mídia para stickers.
- **Outros:** Módulos internos de utilitários e configuração (ex.: [`rateLimiter.js`](src/auth/rateLimiter.js)).

## Estrutura do Projeto

A estrutura principal do projeto está organizada da seguinte forma:

- **Configuração e Documentação**

  - [.env](.env) – Variáveis de ambiente seguras.
  - [.gitignore](.gitignore) – Arquivos e pastas ignoradas pelo Git.
  - [LICENSE](LICENSE) – Termos da licença MIT.
  - [README.md](README.md) – Documentação deste projeto.

- **Código-Fonte (`src/`)**

  - **auth/**
    - [connection.js](src/auth/connection.js) – Gerencia a conexão e reconexão com o WhatsApp.
    - **data/** – Dados de configuração e autenticação (ex.: [options.json](src/auth/data/options.json)).
    - **temp/** – Armazena arquivos temporários de autenticação.
  - **config/**
    - [options.json](src/config/options.json) – Parâmetros de configuração do bot.
  - **controllers/**
    - [botController.js](src/controllers/botController.js) – Processa comandos e gerencia respostas (inclusive com integração ao Gemini AI).
    - [messageController.js](src/controllers/messageController.js) – Formata e exibe mensagens no console.
  - **modules/**
    - **gemini/** – Integração com modelo de IA para respostas inteligentes ([index.js](src/modules/gemini/index.js)).
    - **sticker/** – Conversão de mídia em stickers e gerenciamento dos metadados EXIF ([sticker.js](src/modules/sticker/sticker.js)).
  - **temp/** – Armazena arquivos temporários do processamento.
  - **utils/**
    - [functions.js](src/utils/functions.js) – Funções auxiliares (ex.: manipulação de arquivos, requisições HTTP).

- **Outros Diretórios**

  - **public/** – Arquivos públicos e exemplos (ex.: [example.txt](public/example.txt)).
  - **logs/** – Logs de execução e conexão (_logs/connection.log_).
  - **test/** – Arquivos de teste e exemplos.

- **Arquivo Principal**
  - [start.js](start.js) – Ponto de entrada da aplicação, responsável por iniciar o bot.

## Como Rodar o Projeto

Siga os passos abaixo para configurar e iniciar o bot:

1. **Clone o repositório:**

   ```bash
   git clone https://github.com/Kaikygr/galactic-cat.git
   cd galactic-cat
   ```

2. **Instale as dependências:**

   ```bash
   npm install
   ```

3. **Configuração do Ambiente:**

   - Crie um arquivo .env configurando as variáveis necessárias para a autenticação e demais integrações.
   - Ajuste os dados de autenticação em options.json e options.json conforme necessário.

4. **Inicie o Bot:**

   ```bash
   npm start
   ```

   O bot irá iniciar o processo de conexão (gerenciado por connection.js) e exibirá um QR Code no terminal para emparelhamento caso ainda não esteja registrado.

## Contribuições

Contribuições para melhorias, correções e novas funcionalidades são bem-vindas!

- Crie uma branch para sua feature ou correção.
- Envie um _Pull Request_ com suas alterações.
- Confira os testes existentes em [example.txt](public/example.txt) para entender como validar a funcionalidade.

## Licença

Este projeto é licenciado sob a MIT License.

## Autor

- **Kaikygr**  
  [GitHub: Kaikygr](https://github.com/Kaikygr)

```

```
