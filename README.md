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

---

## Estrutura do Banco de Dados

O **Galactic-Cat** utiliza um banco de dados MySQL para armazenar informações relacionadas a mensagens, grupos e participantes. Abaixo estão as tabelas principais e suas relações:

### Tabelas e Relações

1. **Tabela `groups`**

   - Armazena informações sobre os grupos do WhatsApp.
   - **Colunas**:
     - `id` (VARCHAR, PRIMARY KEY): Identificador único do grupo.
     - `name` (VARCHAR): Nome do grupo.
     - `owner` (VARCHAR): Identificador do dono do grupo.
     - `created_at` (DATETIME): Data de criação do grupo.
     - `description` (TEXT): Descrição do grupo.

2. **Tabela `users`**

   - Armazena mensagens enviadas por usuários.
   - **Colunas**:
     - `id` (INT, PRIMARY KEY): Identificador único da mensagem.
     - `sender` (VARCHAR): Identificador do remetente.
     - `pushName` (VARCHAR): Nome de exibição do remetente.
     - `isGroup` (TINYINT): Indica se a mensagem é de um grupo (1) ou privada (0).
     - `messageType` (VARCHAR): Tipo da mensagem (ex.: texto, imagem).
     - `messageContent` (TEXT): Conteúdo da mensagem.
     - `timestamp` (DATETIME): Data e hora do envio.
     - `group_id` (VARCHAR, FOREIGN KEY): Relaciona a mensagem a um grupo (ou "privado" para mensagens diretas).

3. **Tabela `group_participants`**
   - Armazena os participantes de cada grupo.
   - **Colunas**:
     - `group_id` (VARCHAR, FOREIGN KEY): Identificador do grupo.
     - `participant` (VARCHAR): Identificador do participante.
     - `isAdmin` (TINYINT): Indica se o participante é administrador (1) ou não (0).

### Relações

- A tabela `users` possui uma chave estrangeira (`group_id`) que referencia a tabela `groups`.
- A tabela `group_participants` possui uma chave composta (`group_id`, `participant`) e referencia a tabela `groups`.

---

## Configuração do Ambiente

Certifique-se de configurar as variáveis de ambiente corretamente antes de iniciar o projeto. As variáveis necessárias são:

### Variáveis de Ambiente

- `MYSQL_LOGIN_USER`: Usuário do banco de dados MySQL (obrigatório).
- `MYSQL_LOGIN_PASSWORD`: Senha do usuário do banco de dados MySQL (obrigatório).
- `MYSQL_HOST`: Host do banco de dados MySQL (opcional, padrão: `localhost`).
- `MYSQL_DATABASE`: Nome do banco de dados (opcional, padrão: `cat`).
- `GEMINI_APIKEY`: Sua chave de acesso do Google IA (Gemini).

Exemplo de arquivo `.env`:

```env
GEMINI_APIKEY=NZ9323ZB3
MYSQL_LOGIN_USER=root
MYSQL_LOGIN_PASSWORD=senha"123"
MYSQL_HOST=localhost
MYSQL_DATABASE=galactic_cat
```

---

## Como Rodar o Projeto

**Siga os passos abaixo para configurar e iniciar o bot:**

1. **Clone o repositório:** <br>

   ```bash
   git clone https://github.com/Kaikygr/galactic-cat.git
   cd galactic-cat
   ```

2. **Instale as dependências:** <br>

   ```bash
   npm install
   ```

3. **Configuração do Ambiente:** <br>

   - Crie um arquivo `.env` com as variáveis descritas acima.
   - Certifique-se de que o MySQL está instalado e configurado no sistema.

4. **Inicie o Banco de Dados e as Tabelas:** <br>

   O banco de dados será inicializado automaticamente ao iniciar o bot. As tabelas serão criadas se ainda não existirem.

5. **Inicie o Bot com PM2:** <br>

   - Para iniciar, execute: <br>
     ```bash
     npm start
     ```
   - Para verificar os logs: <br>
     ```bash
     npm run logs
     ```

---

## Contribuições

Contribuições para melhorias, correções e novas funcionalidades são bem-vindas!

- Crie uma branch para sua feature ou correção.
- Envie um _Pull Request_ com suas alterações.

---

## Licença

Este projeto é licenciado sob a MIT License.

---

## Autor

- **Kaikygr**  
  [GitHub: Kaikygr](https://github.com/Kaikygr)
