# Galactic-Cat - Chatbot para WhatsApp

<p align="center">
  <img src="https://static.tumblr.com/f76d0c37c94757b5b0c3cceb73a1664b/ftrdqzb/cZSorgwba/tumblr_static_tumblr_static_akjaybqi5ggg8o4sgwowggogc_640.gif" alt="Banner">
</p>

[![License#: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) ![GitHub commit activity](https://img.shields.io/github/commit-activity/y/kaikygr/galactic-cat) ![GitHub top language](https://img.shields.io/github/languages/top/kaikygr/galactic-cat) ![GitHub branch status](https://img.shields.io/github/checks-status/kaikygr/galactic-cat/main) ![GitHub repo size](https://img.shields.io/github/repo-size/kaikygr/galactic-cat) ![GitHub forks](https://img.shields.io/github/forks/kaikygr/galactic-cat) ![GitHub package.json version](https://img.shields.io/github/package-json/v/kaikygr/galactic-cat) ![GitHub Release](https://img.shields.io/github/v/release/kaikygr/galactic-cat)

## Visão Geral

_**Galactic-Cat**_ é um chatbot open-source desenvolvido em **[Node.js](https://nodejs.org/en)** para integração com o **[WhatsApp](https://www.whatsapp.com/)**. Ele utiliza a API **[baileys](https://www.npmjs.com/package/baileys)** para gerenciar conexões, envio e recebimento de mensagens, permitindo a construção de interações avançadas.

Além disso, o **Galactic-Cat** possui as seguintes características:

- **Eficiência e Confiabilidade:** Gerencia múltiplas conexões de forma robusta, garantindo maior estabilidade na comunicação.
- **Funcionalidades Avançadas:** Inclui recursos que vão desde comandos básicos de interação até integrações mais complexas, ampliando a usabilidade do bot.
- **Facilidade de Configuração:** Com instruções claras para instalação e configuração, o projeto facilita a entrada de novos desenvolvedores.
- **Open-Source:** Permite contribuições da comunidade, incentivando melhorias contínuas e a evolução do projeto.

Esta abordagem modular e a utilização de tecnologias modernas tornam o **Galactic-Cat** uma ótima base para quem deseja implementar um sistema de automação para o **WhatsApp** de forma flexível e escalável.

## Como Rodar o Projeto

**Siga os passos abaixo para configurar e iniciar o bot:**

1. **Clone o repositório:** <br>

   ```bash
   git clone https://github.com/Kaikygr/galactic-cat.git
   cd galactic-cat
   ```

   <br>

2. **Instale as dependências:** <br>

   ```bash
   npm install
   ```

   <br>

3. **Configuração do Ambiente:** <br>

- ℹ️ Crie um arquivo `.env` com as seguintes variáveis: <br>

```bash
GEMINI_APIKEY=1234567890abcdef
GLOBAL_PREFIX=/
```

  <br>

- ℹ️ Para obter a chave da API Gemini, acesse o [Google IA](https://aistudio.google.com/apikey).  
  <br>
- ℹ️ Nota: Certifique-se de instalar o FFmpeg e o Webpmux em seu sistema. No Linux, utilize o gerenciador de pacotes correspondente; no Windows, consulte as instruções disponíveis nos sites oficiais. <br>

1. **Inicie o Bot com PM2:**

- Para iniciar, execute: <br>
  ```bash
  npm start
  ```
    <br>
- Para verificar os logs: <br>
  ```bash
  npm run logs
  ```
  <br>

**O bot irá iniciar o processo de conexão (gerenciado por [Connection.js](./src/auth/connection.js)) e exibirá um QR Code no terminal para emparelhamento caso ainda não esteja registrado.**

## Contribuições

Contribuições para melhorias, correções e novas funcionalidades são bem-vindas!

- Crie uma branch para sua feature ou correção.
- Envie um _Pull Request_ com suas alterações.

## Licença

Este projeto é licenciado sob a MIT License.

## Autor

- **Kaikygr**  
  [GitHub: Kaikygr](https://github.com/Kaikygr)
