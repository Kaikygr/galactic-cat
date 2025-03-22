# Galactic-Cat - Chatbot para WhatsApp

<p align="center">
  <img src="https://static.tumblr.com/f76d0c37c94757b5b0c3cceb73a1664b/ftrdqzb/cZSorgwba/tumblr_static_tumblr_static_akjaybqi5ggg8o4sgwowggogc_640.gif" alt="Banner">
</p>

[![License#: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) ![GitHub commit activity](https://img.shields.io/github/commit-activity/y/kaikygr/galactic-cat) ![GitHub top language](https://img.shields.io/github/languages/top/kaikygr/galactic-cat) ![GitHub branch status](https://img.shields.io/github/checks-status/kaikygr/galactic-cat/main) ![GitHub repo size](https://img.shields.io/github/repo-size/kaikygr/galactic-cat) ![GitHub forks](https://img.shields.io/github/forks/kaikygr/galactic-cat) ![GitHub package.json version](https://img.shields.io/github/package-json/v/kaikygr/galactic-cat) ![GitHub Release](https://img.shields.io/github/v/release/kaikygr/galactic-cat)

## Visão Geral

_Galactic-Cat_ é um chatbot open-source desenvolvido em **Node.js** para integrar com o **WhatsApp**. Ele utiliza a API [@whiskeysockets/baileys](https://www.npmjs.com/package/@whiskeysockets/baileys) para gerenciar conexões, envio e recebimento de mensagens, e inclui funcionalidades avançadas.

## Tecnologias Utilizadas

- **Node.js:** Plataforma para execução do JavaScript.
- **@whiskeysockets/baileys:** API para integração com WhatsApp.
- **PostgreSQL:** Banco de dados relacional para armazenamento de interações.
- **FFmpeg & Webpmux:** Utilizados na conversão de mídia para stickers.
- **Outros:** Módulos internos de utilitários e configuração.

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

   - Crie um arquivo `.env` com as seguintes variáveis:

     ```bash
     GEMINI_APIKEY=1234567890abcdef
     ZERO_APIKEY=abcdef1234567890
     GLOBAL_PREFIX=/
     DB_HOST=localhost
     DB_PORT=5432
     DB_NAME=galacticcat
     DB_USER=usuario_example
     DB_PASSWORD=senha123
     ```

   Para obter a chave da API Gemini, acesse o [Google Developers](https://developers.google.com/).

   Para configurar o banco de dados PostgreSQL, consulte a [documentação oficial do PostgreSQL](https://www.postgresql.org/docs/) com instruções para sistemas Windows e Linux.

   Nota: Certifique-se de instalar o FFmpeg e o Webpmux em seu sistema. No Linux, utilize o gerenciador de pacotes correspondente; no Windows, consulte as instruções disponíveis nos sites oficiais.

   - Configure os parâmetros do bot em [src/config/options.json](src/config/options.json).

4. **Inicie o Bot com PM2:**

   - Para iniciar em produção, execute:
     ```bash
     npm start
     ```
   - Para verificar os logs:
     ```bash
     npm run logs
     ```

   O bot irá iniciar o processo de conexão (gerenciado por connection.js) e exibirá um QR Code no terminal para emparelhamento caso ainda não esteja registrado.

## Contribuições

Contribuições para melhorias, correções e novas funcionalidades são bem-vindas!

- Crie uma branch para sua feature ou correção.
- Envie um _Pull Request_ com suas alterações.

## Licença

Este projeto é licenciado sob a MIT License.

## Autor

- **Kaikygr**  
  [GitHub: Kaikygr](https://github.com/Kaikygr)
