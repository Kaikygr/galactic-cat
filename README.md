# Galactic-Cat - Chatbot Avançado para WhatsApp

<p align="center">
  <img src="https://static.tumblr.com/f76d0c37c94757b5b0c3cceb73a1664b/ftrdqzb/cZSorgwba/tumblr_static_tumblr_static_akjaybqi5ggg8o4sgwowggogc_640.gif" alt="Galactic-Cat Banner">
</p>

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) [![GitHub commit activity](https://img.shields.io/github/commit-activity/y/kaikygr/galactic-cat)](https://github.com/Kaikygr/galactic-cat/commits/main) [![GitHub top language](https://img.shields.io/github/languages/top/kaikygr/galactic-cat)](https://github.com/Kaikygr/galactic-cat) [![GitHub branch checks state](https://img.shields.io/github/checks-status/kaikygr/galactic-cat/main)](https://github.com/Kaikygr/galactic-cat/actions) [![GitHub repo size](https://img.shields.io/github/repo-size/kaikygr/galactic-cat)](https://github.com/Kaikygr/galactic-cat) [![GitHub forks](https://img.shields.io/github/forks/kaikygr/galactic-cat)](https://github.com/Kaikygr/galactic-cat/network/members) [![GitHub package.json version](https://img.shields.io/github/package-json/v/kaikygr/galactic-cat)](package.json)
[![GitHub Release](https://img.shields.io/github/v/release/kaikygr/galactic-cat)](https://github.com/Kaikygr/galactic-cat/releases)

## Sumário

- [Visão Geral](#visão-geral)
- [Principais Funcionalidades](#principais-funcionalidades)
- [Tecnologias Utilizadas](#tecnologias-utilizadas)
- [Arquitetura do Projeto](#arquitetura-do-projeto)
- [Estrutura do Banco de Dados](#estrutura-do-banco-de-dados)
  - [Tabelas e Relações](#tabelas-e-relações)
- [Configuração do Ambiente](#configuração-do-ambiente)
  - [Pré-requisitos](#pré-requisitos)
  - [Variáveis de Ambiente (.env)](#variáveis-de-ambiente-env)
  - [Configurações Adicionais (options.json)](#configurações-adicionais-optionsjson)
- [Instalação](#instalação)
- [Como Rodar o Projeto](#como-rodar-o-projeto)
  - [Modo de Produção](#modo-de-produção)
  - [Modo de Desenvolvimento](#modo-de-desenvolvimento)
- [Contribuições](#contribuições)
- [Licença](#licença)
- [Autor](#autor)

## Visão Geral

**Galactic-Cat** é um chatbot open-source robusto e extensível para automação no WhatsApp, construído com **[Node.js](https://nodejs.org/en)** e a biblioteca **[baileys](https://github.com/WhiskeySockets/Baileys)**. Projetado para ser eficiente e confiável, ele oferece uma base sólida para desenvolvedores criarem interações complexas e automatizadas, desde respostas simples até integrações com serviços de IA e gerenciamento avançado de grupos.

O projeto prioriza a modularidade, permitindo fácil manutenção e adição de novas funcionalidades. Com uma configuração clara e gerenciamento de processos via PM2, o Galactic-Cat é adequado tanto para desenvolvimento quanto para implantação em produção.

## Principais Funcionalidades

O Galactic-Cat oferece um conjunto abrangente de funcionalidades:

1.  **Conexão e Gerenciamento de Sessão:**

    - Autenticação via QR Code.
    - Persistência do estado da sessão para reconexões rápidas (`src/auth/temp/`).
    - Lógica robusta de reconexão automática com backoff exponencial em caso de desconexões inesperadas (exceto logout).
    - Utilização da biblioteca `baileys` para comunicação direta com a API do WhatsApp (`src/auth/connection.js`).

2.  **Processamento Inteligente de Mensagens:**

    - Detecção e parsing de comandos baseados em prefixos configuráveis (`src/controllers/messageTypeController.js`, `src/config/options.json`).
    - Extração de corpo de mensagem de diversos tipos (texto, legendas de mídia, respostas a botões/listas).
    - Identificação de tipos de mídia (imagem, vídeo, áudio, documento, sticker).
    - Verificação e extração de informações de mensagens citadas (quoted messages).
    - Leitura de configurações de mensagens efêmeras.

3.  **Gerenciamento Avançado de Grupos:**

    - Processamento de eventos de atualização de participantes: entrada (`add`), saída (`remove`), promoção (`promote`), rebaixamento (`demote`) (`src/controllers/groupEventsController.js`).
    - Mensagens de boas-vindas e despedida personalizáveis (texto e mídia) por grupo (`src/modules/groupsModule/welcome/`).
    - Suporte a placeholders dinâmicos nas mensagens de evento (ex: `{user}`, `{groupName}`, `{desc}`, `{size}`).
    - Busca e cache de metadados de grupos (nome, descrição, participantes, admins) para otimizar o desempenho (`src/controllers/userDataController.js`).
    - Comandos para administradores ativarem/desativarem e configurarem as mensagens de boas-vindas/saída (`/welcome`, `/setwelcome`, etc.).

4.  **Criação de Stickers:**

    - Comando (`/s`) para converter imagens, vídeos curtos ou GIFs (enviados ou citados) em stickers do WhatsApp (`src/modules/stickerModule/processStickers.js`).
    - Processamento de vídeo usando `fluent-ffmpeg` para ajustar formato e FPS.
    - Adição de metadados EXIF personalizados (nome do pacote, autor) aos stickers usando `node-webpmux`.
    - Download seguro de mídia usando `getFileBuffer` com limites de tamanho e timeout (`src/utils/getFileBuffer.js`).

5.  **Integração com IA (Google Gemini):**

    - Comando (`/cat`) para interação conversacional com a API Google Generative AI (Gemini) (`src/modules/geminiModule/geminiCommand.js`).
    - Capacidade de analisar imagens enviadas junto com o prompt de texto.
    - Gerenciamento de histórico de conversas por usuário, armazenado localmente em `src/modules/geminiModule/chat_history/`.
    - Comando (`/setia`) para que usuários definam uma "instrução de sistema" personalizada, modificando o comportamento da IA em suas interações futuras (limpa o histórico ao definir) (`src/modules/geminiModule/processGeminiModule.js`).

6.  **Sistema de Usuários Premium:**

    - Comando (`/p`) exclusivo para o proprietário do bot conceder status premium temporário a usuários (`src/database/processUserPremium.js`).
    - Duração do premium configurável (ex: `30d`, `24h`, `60m`).
    - Verificação automática e remoção do status premium expirado (`src/controllers/rateLimitController.js`).
    - Status premium utilizado para definir limites de uso diferenciados para comandos.

7.  **Rate Limiting de Comandos:**

    - Sistema configurável (`src/config/options.json`) para limitar o número de vezes que um comando pode ser usado por um usuário dentro de uma janela de tempo.
    - Limites distintos para usuários normais e premium.
    - Comandos podem ser desativados definindo o limite como 0.
    - Feedback claro para o usuário ao atingir o limite, informando o tempo restante (`src/controllers/rateLimitController.js`).

8.  **Persistência de Dados e Analytics:**

    - Utilização de banco de dados MySQL para armazenar dados de usuários, grupos, mensagens, participantes e configurações (`src/database/processDatabase.js`).
    - Criação automática das tabelas necessárias na inicialização (`src/controllers/userDataController.js`).
    - Registro detalhado de uso de comandos (`command_usage`) para o sistema de rate limiting.
    - Log de analytics (`command_analytics`) para cada tentativa de execução de comando, incluindo status (permitido, limitado, erro) e contexto (usuário, grupo, premium).
    - Histórico de interações (`interaction_history`) registrando mensagens e comandos processados.

9.  **Logging e Monitoramento:**

    - Sistema de logging robusto utilizando `winston` e `winston-daily-rotate-file` (`src/utils/logger.js`).
    - Logs separados por nível (info, warn, error) e com rotação diária para a pasta `logs/`.
    - Formato de log configurável para console e arquivos, incluindo timestamps, níveis, metadados e stack traces de erro.
    - Redação automática de dados sensíveis (senhas, tokens) nos logs.
    - Configuração via variáveis de ambiente (`LOG_LEVEL`, `ECOSYSTEM_NAME`).

10. **Mensagem de Primeira Interação (Onboarding):**
    - Envio automático de uma mensagem de boas-vindas configurável (`src/config/options.json`) na primeira interação elegível de um novo usuário com o bot (`src/controllers/InteractionController.js`).
    - Funcionalidade controlada pela variável de ambiente `SEND_WELCOME_MESSAGES`.

## Tecnologias Utilizadas

- **Linguagem:** Node.js
- **Comunicação WhatsApp:** `baileys`
- **Banco de Dados:** MySQL (`mysql2`)
- **Inteligência Artificial:** `@google/generative-ai`
- **Gerenciamento de Processos:** PM2 (`pm2`)
- **Processamento de Mídia:** `fluent-ffmpeg`, `node-webpmux`
- **Logging:** `winston`, `winston-daily-rotate-file`
- **Configuração:** `dotenv`, `envalid`
- **Requisições HTTP:** `axios`
- **Manipulação de Datas:** `moment-timezone`
- **Cache:** `node-cache` (para metadados de grupo)

## Arquitetura do Projeto

O projeto segue uma estrutura modular para facilitar a organização e manutenção:

- **`src/auth`:** Contém a lógica de conexão, autenticação e gerenciamento da sessão com o WhatsApp (`connection.js`). Armazena temporariamente os dados da sessão em `src/auth/temp/`.
- **`src/controllers`:** Responsáveis pela orquestração principal do bot, processamento de eventos e delegação de tarefas para módulos específicos (ex: `botController.js`, `userDataController.js`, `rateLimitController.js`, `groupEventsController.js`, `InteractionController.js`).
- **`src/database`:** Gerencia a interação com o banco de dados MySQL, incluindo inicialização, execução de queries e criação de tabelas (`processDatabase.js`, `processUserPremium.js`).
- **`src/modules`:** Contém a lógica específica de cada funcionalidade principal do bot (ex: `stickerModule`, `geminiModule`, `groupsModule`). Cada módulo pode ter seus próprios subdiretórios para processamento, comandos, dados, etc.
- **`src/utils`:** Utilitários reutilizáveis, como o logger (`logger.js`) e funções para download de mídia (`getFileBuffer.js`).
- **`src/config`:** Arquivos de configuração estática, como `options.json`, que define limites de comandos, mensagens padrão, etc.
- **Raiz do Projeto:** Arquivos de configuração como `package.json`, `.env` (a ser criado), `ecosystem.config.js` (PM2), `nodemon.json`.

## Estrutura do Banco de Dados

O Galactic-Cat utiliza um banco de dados MySQL para persistir dados essenciais. As tabelas são criadas automaticamente na primeira inicialização se não existirem. Os nomes exatos das tabelas são definidos em `src/config/options.json -> database.tables`.

### Tabelas e Relações

1.  **`groups`**: Armazena metadados e configurações de grupos do WhatsApp.

    - `id` (VARCHAR, PK): JID do grupo.
    - `name`, `owner`, `created_at`, `description`, `size`, etc.: Metadados básicos.
    - `isPremium`, `premiumTemp`: Status premium do grupo (se aplicável).
    - `is_welcome` (TINYINT): Flag (0 ou 1) para ativar/desativar mensagens de boas-vindas/saída.
    - `welcome_message`, `welcome_media`: Texto e URL da mídia de boas-vindas.
    - `exit_message`, `exit_media`: Texto e URL da mídia de despedida.
    - Outros campos relacionados a configurações do grupo (`restrict`, `announce`, etc.).

2.  **`users`**: Armazena informações sobre os usuários que interagiram com o bot.

    - `sender` (VARCHAR, PK): JID do usuário.
    - `pushName`: Nome de exibição do usuário (atualizado na interação).
    - `isPremium`, `premiumTemp`: Status premium do usuário.
    - `has_interacted`, `first_interaction_at`, `last_interaction_at`: Rastreamento de interações.

3.  **`messages`**: Log de mensagens processadas pelo bot.

    - `message_id` (VARCHAR): ID único da mensagem no WhatsApp.
    - `sender_id` (VARCHAR, FK -> users.sender): JID do remetente.
    - `group_id` (VARCHAR, FK -> groups.id, NULLABLE): JID do grupo (ou NULL para chat privado).
    - `messageType`: Tipo da mensagem (ex: 'text', 'imageMessage').
    - `messageContent` (MEDIUMTEXT): Conteúdo da mensagem (JSON stringified do objeto da mensagem Baileys).
    - `timestamp`: Data/hora do processamento.
    - (PK: `sender_id`, `timestamp`, `message_id`)

4.  **`group_participants`**: Mapeia usuários a grupos e seu status de administrador.

    - `group_id` (VARCHAR, FK -> groups.id): JID do grupo.
    - `participant` (VARCHAR): JID do participante.
    - `isAdmin` (TINYINT): Flag (0 ou 1) indicando se é admin/superadmin.
    - (PK: `group_id`, `participant`)

5.  **`command_usage`**: Rastreia o uso de comandos para o sistema de Rate Limiting.

    - `user_id` (VARCHAR, FK -> users.sender): JID do usuário.
    - `command_name`: Nome do comando utilizado.
    - `usage_count_window`: Contagem de usos na janela de tempo atual.
    - `window_start_timestamp`, `last_used_timestamp`: Timestamps para controle da janela.
    - (PK: `user_id`, `command_name`)

6.  **`command_analytics`**: Log detalhado para análise de execução de comandos.

    - `id` (BIGINT, PK, AI): ID único do log.
    - `user_id` (VARCHAR, FK -> users.sender).
    - `command_name`.
    - `group_id` (VARCHAR, FK -> groups.id, NULLABLE).
    - `timestamp`.
    - `is_premium_at_execution`: Status premium no momento da execução.
    - `execution_status` (ENUM: 'allowed', 'rate_limited', 'disabled', 'error'): Resultado da verificação de limite/permissão.
    - `rate_limit_count_before`, `rate_limit_limit_at_execution`: Contagem e limite no momento da verificação.

7.  **`interaction_history`**: Registra todas as interações significativas com o bot.
    - `id` (BIGINT, PK, AI).
    - `user_id` (VARCHAR, FK -> users.sender).
    - `timestamp`.
    - `interaction_type` (ENUM: 'private_message', 'private_command', 'group_command', 'group_message').
    - `group_id` (VARCHAR, NULLABLE).
    - `command_name` (VARCHAR, NULLABLE).

_Nota: As chaves estrangeiras (FK) garantem a integridade referencial entre as tabelas._

## Configuração do Ambiente

### Pré-requisitos

- **Node.js:** Versão 16.x ou superior recomendada. Verifique com `node -v`.
- **MySQL:** Um servidor MySQL (versão 5.7+) instalado e acessível.
- **Git:** Para clonar o repositório.
- **ffmpeg:** Utilitário essencial para processamento de vídeo na criação de stickers. Instale-o através do gerenciador de pacotes do seu sistema (ex: `apt install ffmpeg`, `brew install ffmpeg`) e garanta que esteja no PATH.
- **libwebp-tools:** Contém `webpmux`, necessário para adicionar metadados a stickers WebP. Instale via gerenciador de pacotes (ex: `apt install webp`, `brew install webp`).

### Variáveis de Ambiente (.env)

Antes de iniciar, crie um arquivo chamado `.env` na raiz do projeto. Este arquivo armazena configurações sensíveis e específicas do seu ambiente. Copie e cole o exemplo abaixo, substituindo os valores pelos seus.

```markdown
# ==================================

# CREDENCIAIS DO BANCO DE DADOS

# ==================================

# Usuário para conectar ao MySQL (OBRIGATÓRIO)

MYSQL_LOGIN_USER=root

# Senha para o usuário MySQL (OBRIGATÓRIO)

MYSQL_LOGIN_PASSWORD=sua_senha_segura

# ==================================

# CONFIGURAÇÕES DO BANCO DE DADOS

# ==================================

# Endereço do servidor MySQL (Opcional, padrão: localhost)

MYSQL_HOST=localhost

# Nome do banco de dados a ser usado/criado (Opcional, padrão: galactic_cat)

MYSQL_DATABASE=galactic_cat

# Limite de conexões no pool do MySQL (Opcional, padrão: 20)

MYSQL_CONNECTION_LIMIT=20

# Timeout para conexão inicial ao MySQL em ms (Opcional, padrão: 10000)

MYSQL_CONNECT_TIMEOUT=10000

# ==================================

# CHAVES DE API EXTERNAS

# ==================================

# Chave da API do Google Generative AI (Gemini) (OBRIGATÓRIO para usar IA)

# Obtenha em: [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)

GEMINI_APIKEY=SUA_GOOGLE_GEMINI_API_KEY_AQUI

# ==================================

# CONFIGURAÇÕES DO BOT E LOGGING

# ==================================

# Nome do serviço/instância (Usado em logs e PM2) (Opcional, padrão: bot-system)

ECOSYSTEM_NAME=galactic-cat-prod

# Nível de detalhe dos logs (Opcional, padrão: info em produção, debug em desenvolvimento)

# Opções: error, warn, info, http, verbose, debug, silly

LOG_LEVEL=info

# Envia mensagem de boas-vindas na primeira interação? (Opcional, padrão: false)

# Defina como 'true' para ativar.

SEND_WELCOME_MESSAGES=true

# ==================================

# OPÇÕES AVANÇADAS (Raramente alteradas)

# ==================================

# Habilitar logs detalhados da biblioteca Baileys? (padrão: false)

# DEBUG_BAILEYS=false

# Sincronizar todo o histórico do WhatsApp ao conectar? (pode ser lento) (padrão: false)

# SYNC_FULL_HISTORY=false

# Verificar saúde do pool de conexões do DB na inicialização? (padrão: false)

# VERIFY_POOL_ON_INIT=false
```

**Importante:**

- O banco de dados (`MYSQL_DATABASE`) será criado automaticamente se não existir, mas o usuário (`MYSQL_LOGIN_USER`) precisa ter permissão `CREATE DATABASE`.
- Mantenha o arquivo `.env` seguro e não o inclua no controle de versão (já está no `.gitignore` padrão).

### Configurações Adicionais (options.json)

O arquivo `src/config/options.json` contém configurações não sensíveis que definem o comportamento do bot:

- **`bot.onboarding.firstInteractionMessage`**: Template da mensagem de boas-vindas inicial. Use placeholders como `{userName}`, `{ownerName}`, `{prefix}`, `{ownerWhatsappLink}`.
- **`bot.globalSettings.prefix`**: Lista de prefixos que o bot reconhecerá para comandos (ex: `["/", "!"]`).
- **`owner`**: Detalhes do proprietário do bot para exibição e contato.
- **`database.tables`**: Mapeamento dos nomes lógicos das tabelas para os nomes físicos no banco de dados.
- **`defaults`**: Valores padrão para dados de usuários e grupos caso não sejam encontrados no DB.
- **`cache.groupMetadataExpiryMs`**: Duração do cache para metadados de grupo (em milissegundos).
- **`commandLimits`**: Define os limites de uso para cada comando (`nonPremium` e `premium`), incluindo `limit` (número de usos, -1 para ilimitado, 0 para desativado) e `windowMinutes` (duração da janela de contagem). Inclui também uma `description` para cada comando, usada no comando `/menu`.

## Instalação

Após configurar os pré-requisitos e o ambiente:

1.  **Clone o repositório:**
    ```bash
    git clone https://github.com/Kaikygr/galactic-cat.git
    cd galactic-cat
    ```
2.  **Instale as dependências do Node.js:**
    ```bash
    npm install
    ```
    _(Isso instalará todas as bibliotecas listadas no `package.json`)._

## Como Rodar o Projeto

O projeto utiliza **[PM2](https://pm2.keymetrics.io/)** para gerenciamento robusto de processos. Os scripts no `package.json` e o arquivo `ecosystem.config.js` facilitam a inicialização.

### Modo de Produção

Recomendado para uso contínuo. Utiliza as configurações definidas em `env_production` no `ecosystem.config.js`.

```bash
npm start
```

**Gerenciando com PM2:**

- **Listar processos:** `pm2 list`
- **Ver logs em tempo real:** `pm2 logs` (ou `pm2 logs <ECOSYSTEM_NAME>`)
- **Ver status detalhado:** `pm2 show <ECOSYSTEM_NAME>`
- **Parar o bot:** `pm2 stop <ECOSYSTEM_NAME>`
- **Reiniciar o bot:** `pm2 restart <ECOSYSTEM_NAME>`
- **Parar e remover da lista:** `pm2 delete <ECOSYSTEM_NAME>`

_(Substitua `<ECOSYSTEM_NAME>` pelo valor definido no seu `.env` ou o padrão `bot-system`)._

### Modo de Desenvolvimento

Ideal para desenvolvimento e testes. Utiliza `nodemon` para reiniciar automaticamente o bot após alterações no código. Usa as configurações `env` (development) do `ecosystem.config.js`.

```bash
npm run dev
```

O terminal exibirá os logs diretamente. Pressione `Ctrl+C` para parar. As configurações de quais arquivos observar e ignorar estão em `nodemon.json`.

**Primeira Execução (Ambos os Modos):**

1.  Ao iniciar pela primeira vez (ou após limpar a pasta `src/auth/temp/`), um **QR Code** será exibido no terminal.
2.  Abra o WhatsApp no seu celular.
3.  Vá para **Configurações \> Aparelhos conectados \> Conectar um aparelho**.
4.  Escaneie o QR Code exibido no terminal.
5.  Aguarde a mensagem de conexão estabelecida nos logs. A sessão será salva em `src/auth/temp/` para futuras inicializações.

## Contribuições

Sua contribuição é muito bem-vinda\! Para ajudar a melhorar o Galactic-Cat:

1.  **Fork** o repositório para sua conta GitHub.
2.  **Clone** o seu fork localmente: `git clone https://github.com/SEU_USUARIO/galactic-cat.git`
3.  **Crie uma Branch** descritiva para sua alteração: `git checkout -b feature/nova-funcionalidade` ou `git checkout -b fix/correcao-bug`
4.  **Implemente** suas modificações ou correções.
5.  **Teste** suas alterações exaustivamente.
6.  **Faça o Commit** das suas alterações com mensagens claras: `git commit -am 'Adiciona funcionalidade X'`
7.  **Faça o Push** para a sua branch no GitHub: `git push origin feature/nova-funcionalidade`
8.  **Abra um Pull Request** no repositório original (`Kaikygr/galactic-cat`), detalhando suas alterações.

**Diretrizes:**

- Mantenha o estilo de código consistente com o projeto.
- Adicione comentários relevantes ao seu código.
- Atualize a documentação (README.md) se necessário.
- Certifique-se de que suas alterações não quebrem funcionalidades existentes.

## Licença

Este projeto é distribuído sob a **Licença MIT**.

## Autor

- **Kaikygr**
  - GitHub: [@Kaikygr](https://www.google.com/search?q=https://github.com/Kaikygr)
  - Contato: [WhatsApp](https://www.google.com/search?q=https://wa.me/message/C4CZHIMQU66PD1) (Link do `options.json`)

---

_Sinta-se à vontade para abrir Issues no GitHub para relatar bugs ou sugerir novas funcionalidades._
