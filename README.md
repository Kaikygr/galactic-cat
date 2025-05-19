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
  - [Iniciando o Bot com PM2](#iniciando-o-bot-com-pm2)
- [Lista Detalhada de Comandos](#lista-detalhada-de-comandos)
- [Solução de Problemas Comuns (Troubleshooting)](#solução-de-problemas-comuns-troubleshooting)
- [Como Atualizar o Bot](#como-atualizar-o-bot)
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
    - Persistência do estado da sessão para reconexões rápidas (`src/auth/temp/auth_state/`).
    - Lógica robusta de reconexão automática com backoff exponencial em caso de desconexões inesperadas (exceto logout), configurável via variáveis de ambiente.
    - Utilização da biblioteca `baileys` para comunicação direta com a API do WhatsApp (`src/auth/connection.js`).

2.  **Processamento Inteligente de Mensagens:**

    - Detecção e parsing de comandos baseados em um prefixo global configurável via variável de ambiente (`BOT_GLOBAL_PREFIX` no arquivo `.env`) e processado em `src/controllers/messageTypeController.js`.
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

O projeto segue uma estrutura modular para facilitar a organização, manutenção e escalabilidade:

- **`src/auth`:** Contém a lógica de conexão, autenticação e gerenciamento da sessão com o WhatsApp (`connection.js`). Armazena os dados da sessão em `src/auth/temp/auth_state/`.
- **`src/controllers`:** Responsáveis pela orquestração principal do bot, processamento de eventos e delegação de tarefas para módulos específicos (ex: `botController.js`, `userDataController.js`, `rateLimitController.js`, `groupEventsController.js`, `InteractionController.js`).
- **`src/database`:** Gerencia a interação com o banco de dados MySQL, incluindo inicialização, execução de queries e criação de tabelas (`processDatabase.js`, `processUserPremium.js`).
- **`src/modules`:** Contém a lógica específica de cada funcionalidade principal do bot (ex: `stickerModule`, `geminiModule`, `groupsModule`). Cada módulo pode ter seus próprios subdiretórios para processamento, comandos, dados, etc. O prefixo dos comandos é definido globalmente via variável de ambiente.
- **`src/utils`:** Utilitários reutilizáveis, como o logger (`logger.js`) e funções para download de mídia (`getFileBuffer.js`).
- **`src/config`:** Arquivos de configuração estática, como `options.json`, que define limites de comandos, mensagens padrão, etc.
- **Raiz do Projeto:** Arquivos de configuração como `package.json`, `.env` (a ser criado), `ecosystem.config.js` (PM2).

### O Guardião dos Dados: `src/controllers/userDataController.js`

O arquivo `src/controllers/userDataController.js` é o módulo central para o gerenciamento e persistência de dados relacionados a usuários, grupos e mensagens no Galactic-Cat. Ele interage diretamente com o banco de dados MySQL e implementa um sistema de cache para otimizar o acesso a metadados de grupos.

**Principais Responsabilidades:**

1.  **Inicialização e Manutenção do Banco de Dados:**

    - **`createTables()`**: Função crucial chamada durante a inicialização do bot (via `connection.js`). Ela verifica a existência de todas as tabelas necessárias (`users`, `groups`, `messages`, `group_participants`, `command_usage`, `command_analytics`, `interaction_history`) e as cria utilizando `CREATE TABLE IF NOT EXISTS` se não existirem. As definições das tabelas incluem chaves primárias, estrangeiras e índices para garantir a integridade e performance.
    - **`ensureUserInteractionColumns()`**: Garante que colunas específicas para rastrear interações (`first_interaction_at`, `last_interaction_at`, `has_interacted`) existam na tabela `users`, adicionando-as dinamicamente se necessário.

2.  **Processamento de Dados de Mensagens Recebidas (`processUserData`):**

    - Esta é a função principal exportada que é chamada pelo `connection.js` quando novas mensagens (`messages.upsert`) são recebidas.
    - Itera sobre as mensagens válidas, chamando `processIncomingMessageData` para cada uma.

3.  **Lógica de Processamento Individual de Mensagem (`processIncomingMessageData`):**

    - **Validação (`validateIncomingInfo`)**: Verifica se a mensagem possui os dados essenciais (chave, JID remoto) e não é uma mensagem do próprio bot.
    - **Usuário (`saveUserToDatabase`)**: Insere ou atualiza o registro do remetente na tabela `users`, incluindo seu `pushName`.
    - **Grupo (`ensureGroupExists`, `handleGroupMetadataUpdate`)**: Se a mensagem for de um grupo:
      - Garante que o grupo exista na tabela `groups`, criando uma entrada mínima com dados padrão se necessário.
      - Chama `handleGroupMetadataUpdate` para buscar (da API ou cache) e salvar/atualizar os metadados completos do grupo e seus participantes.
    - **Mensagem (`saveMessageToDatabase`)**: Salva os detalhes da mensagem (ID, remetente, grupo, tipo, conteúdo, timestamp) na tabela `messages`. O conteúdo da mensagem é geralmente o objeto Baileys serializado como JSON.

4.  **Gerenciamento de Metadados de Grupo (`handleGroupMetadataUpdate`):**

    - Utiliza uma instância de `GroupMetadataCache` para armazenar e recuperar metadados de grupos, reduzindo chamadas à API do WhatsApp.
    - Se os dados não estiverem no cache ou estiverem expirados, busca-os usando `client.groupMetadata(groupId)`.
    - Busca configurações personalizadas do grupo (como status premium, mensagens de boas-vindas) da tabela `groups` no DB (`getGroupSettingsFromDB`).
    - Mescla os dados da API com os do DB e salva o resultado consolidado na tabela `groups` (`saveGroupToDatabase`).
    - Salva a lista de participantes e seus status de admin na tabela `group_participants` (`saveGroupParticipantsToDatabase`).

5.  **Cache de Metadados de Grupo (`GroupMetadataCache`):**

    - Uma classe interna que implementa um cache simples baseado em `Map` com tempo de expiração configurável (via `options.json -> cache.groupMetadataExpiryMs`).
    - Possui métodos para `set`, `get`, `has`, `delete`, `clear` e um `startAutoCleanup` para remover entradas expiradas periodicamente.

6.  **Registro de Interações (`logInteraction`):**

    - Chamado por outros controllers (como `InteractionController.js`) para registrar quando um usuário interage com o bot.
    - Atualiza os campos `first_interaction_at`, `last_interaction_at` e `has_interacted` na tabela `users`.
    - Insere um registro na tabela `interaction_history` detalhando o tipo de interação (mensagem privada, comando em grupo, etc.).
    - Determina se a interação é a "primeira interação elegível" do usuário, relevante para o sistema de onboarding.

7.  **Configuração e Utilitários:**
    - Carrega configurações do arquivo `src/config/options.json`, como nomes de tabelas, valores padrão para dados de usuário/grupo e tempo de expiração do cache.
    - Utiliza funções utilitárias como `sanitizeData` (para tratar valores nulos/undefined) e `formatTimestampForDB` (para converter datas para o formato do MySQL).

**Fluxo Típico de Dados:**

1.  `connection.js` recebe um evento `messages.upsert`.
2.  Chama `userDataController.processUserData(data, client)`.
3.  `processUserData` itera e chama `processIncomingMessageData(info)` para cada mensagem.
4.  `processIncomingMessageData` valida, salva/atualiza usuário, garante/atualiza grupo (se aplicável, chamando `handleGroupMetadataUpdate`), e salva a mensagem.
5.  `handleGroupMetadataUpdate` usa o cache ou a API para obter metadados do grupo, mescla com dados do DB e persiste tudo.

Em essência, `userDataController.js` assegura que todos os dados relevantes sobre as interações, usuários e grupos sejam corretamente armazenados e mantidos atualizados no banco de dados, servindo como a fonte da verdade para muitas outras partes do sistema.

### O Coração da Conexão: `src/auth/connection.js`

O arquivo `src/auth/connection.js` é fundamental para o funcionamento do Galactic-Cat, sendo responsável por toda a comunicação com a API do WhatsApp através da biblioteca Baileys. Ele encapsula a lógica de conexão, autenticação, gerenciamento de sessão, tratamento de eventos e reconexão automática.

**Principais Responsabilidades:**

1.  **Gerenciamento da Conexão com Baileys:**

    - Utiliza `makeWASocket` da biblioteca Baileys para estabelecer e manter a conexão com o WhatsApp.
    - Configura o socket com opções como o tipo de navegador simulado (`Browsers.macOS('Desktop')`), sincronização de histórico (`SYNC_FULL_HISTORY` via `.env`) e logging interno do Baileys (`DEBUG_BAILEYS` via `.env`).

2.  **Autenticação e Sessão:**

    - Emprega `useMultiFileAuthState` para carregar e salvar o estado de autenticação (credenciais da sessão).
    - Os arquivos da sessão são armazenados no diretório `src/auth/temp/auth_state/`. É esta pasta que precisa ser limpa caso seja necessário gerar um novo QR Code.
    - Quando uma nova sessão é necessária (ou a anterior é invalidada), o script exibe um QR Code no terminal usando `qrcode-terminal` para que o usuário possa escanear com o WhatsApp Web no celular.
    - As credenciais são salvas automaticamente (`creds.update`) para permitir reconexões rápidas sem a necessidade de escanear o QR Code toda vez.

3.  **Tratamento de Eventos:**

    - Registra e manipula diversos eventos emitidos pela instância do Baileys:
      - `connection.update`: Monitora o estado da conexão (conectando, aberto, fechado, QR code recebido).
      - `messages.upsert`: Processa mensagens recebidas, delegando para os controllers (`botController.js`, `userDataController.js`).
      - `groups.update`: Lida com atualizações nos metadados dos grupos.
      - `group-participants.update`: Processa eventos de entrada, saída, promoção ou rebaixamento de participantes em grupos, delegando para `groupEventsController.js`.

4.  **Lógica de Reconexão Robusta:**

    - Implementa uma estratégia de _backoff exponencial_ para tentativas de reconexão automática em caso de desconexões inesperadas (que não sejam `DisconnectReason.loggedOut`).
    - Os parâmetros dessa lógica (atraso inicial, atraso máximo, expoente máximo) são configuráveis através de variáveis de ambiente (ex: `DEFAULT_INITIAL_RECONNECT_DELAY`, `DEFAULT_MAX_RECONNECT_DELAY`).
    - Se a desconexão for devido a um logout (`DisconnectReason.loggedOut`), o bot não tentará reconectar e informará o usuário para limpar a pasta de sessão e gerar um novo QR Code.

5.  **Orquestração e Inicialização:**

    - A classe principal `ConnectionManager` é instanciada como um singleton.
    - No método `initialize()`, o `ConnectionManager` primeiro inicializa a conexão com o banco de dados (`initDatabase`) e garante que as tabelas necessárias existam (`createTables`) antes de tentar se conectar ao WhatsApp.
    - Isso assegura que o bot só comece a processar eventos do WhatsApp quando suas dependências (como o banco de dados) estiverem prontas.

6.  **Logging:**

    - Utiliza a instância de logger global (`src/utils/logger.js`) para registrar eventos importantes, erros e informações de depuração relacionadas à conexão e aos eventos do Baileys.
    - O nível de log do Baileys pode ser controlado pela variável de ambiente `DEBUG_BAILEYS`.

7.  **Interface com o Restante do Sistema:**
    - O módulo exporta a função `getClientInstance()`, que permite que outros módulos (principalmente os controllers) obtenham a instância ativa do cliente Baileys para enviar mensagens, buscar metadados, etc.

**Variáveis de Ambiente Relevantes (controlam `connection.js`):**

- `SYNC_FULL_HISTORY`: Define se o histórico completo de mensagens deve ser sincronizado.
- `DEBUG_BAILEYS`: Habilita logs de debug detalhados da biblioteca Baileys.
- `DEFAULT_INITIAL_RECONNECT_DELAY`, `INITIAL_CONNECT_FAIL_DELAY`, `DEFAULT_MAX_RECONNECT_DELAY`, `DEFAULT_RECONNECT_MAX_EXPONENT`: Controlam o comportamento da reconexão automática.

Em resumo, `connection.js` é o motor que mantém o Galactic-Cat online e reativo, gerenciando a complexidade da comunicação com o WhatsApp e fornecendo uma base estável para todas as outras funcionalidades do bot.

## Estrutura do Banco de Dados

O Galactic-Cat utiliza um banco de dados MySQL para persistir dados essenciais. As tabelas são criadas automaticamente na primeira inicialização se não existirem. Os nomes exatos das tabelas são definidos em `src/config/options.json -> database.tables`.

Abaixo, um diagrama ASCII representando a estrutura e as principais relações entre as tabelas:

```text
                               +---------------------+
                               |        users        |
                               |---------------------|
                               | PK sender           |
                               | pushName            |
                               | isPremium           |
                               | ...                 |
                               +---------------------+
                                   ^   |        |   |
                                   |   |        |   | (user_id FK)
      (sender_id FK) .-------------+   |        |   +----------------------------.
                     |                 |        |                                |
                     v                 v        v                                v
    +-------------------------+  +-----------------------+  +-------------------------+  +-----------------------+
    |        messages         |  |     command_usage     |  |   command_analytics     |  | interaction_history   |
    |-------------------------|  |-----------------------|  |-------------------------|  |-----------------------|
    | PK message_id           |  | PK user_id (FK)       |  | PK id (AI)              |  | PK id (AI)            |
    | PK sender_id (FK)       |  | PK command_name       |  | FK user_id              |  | FK user_id            |
    | PK group_id (FK) -------+  | usage_count_window    |  | FK group_id (NULLABLE) ---+  | timestamp           |
    | messageType             |  | ...                   |  | command_name            |  | interaction_type      |
    | ...                     |  +-----------------------+  | ...                     |  | ...                   |
    +-------------------------+                             +-------------------------+  +-----------------------+
        |                                                              |
        | (group_id FK)                                                | (group_id FK, NULLABLE)
        |                                                              |
        |               +-------------------------+                    |
        +-------------->|         groups          |<-------------------+
                        |-------------------------|
                        | PK id                   |
                        | name                    |
                        | is_welcome              |
                        | ...                     |
                        +-------------------------+
                            ^
                            | (group_id FK)
                            |
            +-------------------------+
            |  group_participants     |
            |-------------------------|
            | PK group_id (FK)        |
            | PK participant          |
            | isAdmin                 |
            +-------------------------+
```

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

```bash
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

# Prefixo global para os comandos do bot (Recomendado)
# Define o caractere que antecede todos os comandos (ex: !, /, .)
# Se não definido, o bot pode tentar usar um prefixo de fallback de options.json ou um padrão interno.
BOT_GLOBAL_PREFIX=!

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
- **`bot.globalSettings.prefix`**: _(Esta configuração foi movida para a variável de ambiente `BOT_GLOBAL_PREFIX` no arquivo `.env` para maior flexibilidade. O valor aqui pode ser considerado um fallback ou ser removido em futuras atualizações se não mais utilizado pelo código.)_
- **`bot.globalSettings.prefix`**: _(Legado/Fallback) Prefixo global para comandos. **Recomenda-se usar a variável de ambiente `BOT_GLOBAL_PREFIX` (definida no arquivo `.env`) que tem prioridade sobre esta configuração.** Este valor em `options.json` pode ser usado como fallback se `BOT_GLOBAL_PREFIX` não estiver definida, ou pode ser descontinuado em futuras versões._
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

O projeto utiliza **[PM2](https://pm2.keymetrics.io/)** para gerenciamento robusto de processos. Os scripts no `package.json` e o arquivo `ecosystem.config.js` facilitam a inicialização. O PM2 será usado tanto para desenvolvimento quanto para produção, utilizando as configurações definidas no `ecosystem.config.js`.

### Iniciando o Bot com PM2

Para iniciar o bot (seja para desenvolvimento ou produção):

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

1.  Ao iniciar pela primeira vez (ou após limpar a pasta `src/auth/temp/auth_state/`), um **QR Code** será exibido no terminal. **Nota Importante:** Se você planeja usar o PM2 imediatamente (com `npm start`), pode ser mais fácil obter o QR Code primeiro executando o script de conexão diretamente uma vez. Abra um terminal na raiz do projeto e execute: `node ./src/auth/connection.js` Após escanear o QR Code e a sessão ser salva, você pode parar este processo (Ctrl+C) e então iniciar com `npm start` ou `npm run dev`.
2.  Abra o WhatsApp no seu celular.
3.  Vá para **Configurações \> Aparelhos conectados \> Conectar um aparelho**.
4.  Escaneie o QR Code exibido no terminal.
5.  Aguarde a mensagem de conexão estabelecida nos logs. A sessão será salva em `src/auth/temp/auth_state/` para futuras inicializações.

## Contribuições

## Lista Detalhada de Comandos

O Galactic-Cat possui diversos comandos para interagir com os usuários e gerenciar o bot. O prefixo padrão para os comandos é `!` (configurável via `BOT_GLOBAL_PREFIX` no `.env`).

Para obter uma lista completa e atualizada de comandos diretamente no chat, utilize o comando:

```
/menu
```

As descrições, permissões e limites de uso de cada comando são definidos no arquivo `src/config/options.json` na seção `commandLimits`. Abaixo, um exemplo de como um comando pode ser estruturado:

**Exemplo de Comando:**

- **Comando:** `/s [parâmetros]`
- **Descrição:** Cria um sticker a partir de uma imagem, vídeo curto ou GIF enviado ou citado.
- **Permissão:** Todos os usuários (sujeito a rate limits).
- **Parâmetros:**
  - `pack <nome_pacote>`: Define o nome do pacote do sticker.
  - `author <nome_autor>`: Define o nome do autor do sticker.
  - `circle`: Cria um sticker circular (apenas para imagens).
- **Exemplo de Uso:**
  - Envie uma imagem e responda com `/s`
  - Envie uma imagem e responda com `/s pack MeuPacote author MeuNome`
- **Observações:**
  - Vídeos são convertidos para GIFs animados.
  - Limites de tamanho e duração de mídia se aplicam.

Consulte o comando `/menu` no bot e o arquivo `options.json` para a lista completa e detalhes de todos os comandos disponíveis, como `/cat` (IA), `/p` (premium), `/welcome` (gerenciamento de boas-vindas), entre outros.

## Solução de Problemas Comuns (Troubleshooting)

Encontrou algum problema? Aqui estão algumas dicas para as questões mais comuns:

1.  **QR Code não aparece ou não funciona:**

    - Verifique sua conexão com a internet.
    - Certifique-se de que não há outro processo do bot rodando e tentando gerar um QR Code.
    - Tente limpar a pasta `src/auth/temp/auth_state/` e reiniciar o bot.
    - Se estiver usando Docker ou uma VM, verifique as configurações de rede e se o terminal pode exibir QR codes corretamente.

2.  **Erro de conexão com o banco de dados MySQL:**

    - Confirme se as credenciais (`MYSQL_LOGIN_USER`, `MYSQL_LOGIN_PASSWORD`, `MYSQL_HOST`, `MYSQL_DATABASE`) no seu arquivo `.env` estão corretas.
    - Verifique se o servidor MySQL está em execução e acessível a partir de onde o bot está rodando.
    - Certifique-se de que o usuário MySQL tem as permissões necessárias (pelo menos `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `CREATE` para o banco de dados especificado).

3.  **Comando `/s` (sticker) não funciona:**

    - **`ffmpeg` não encontrado:** Certifique-se de que o `ffmpeg` está instalado corretamente no seu sistema e que o executável está no PATH do ambiente onde o bot roda. Teste no terminal com `ffmpeg -version`.
    - **`webpmux` não encontrado:** Certifique-se de que as `libwebp-tools` (que incluem `webpmux`) estão instaladas. Teste no terminal com `webpmux -version`.
    - **Mídia muito grande ou formato inválido:** Verifique os logs para erros relacionados ao tamanho ou tipo de arquivo.

4.  **Bot desconectando frequentemente:**

    - Verifique sua conexão com a internet.
    - Pode ser uma instabilidade temporária do WhatsApp.
    - Verifique os logs do bot (`pm2 logs <ECOSYSTEM_NAME>`) para mensagens de erro específicas.

5.  **Como verificar os logs para encontrar erros?**
    - Use `pm2 logs` ou `pm2 logs <ECOSYSTEM_NAME>` para ver os logs em tempo real.
    - Os arquivos de log são salvos na pasta `logs/` na raiz do projeto, separados por data e nível (ex: `error-YYYY-MM-DD.log`).

## Como Atualizar o Bot

Para atualizar sua instância do Galactic-Cat para a versão mais recente do repositório:

1.  Navegue até o diretório do projeto: `cd /caminho/para/galactic-cat`
2.  Pare o bot se estiver rodando com PM2: `pm2 stop <ECOSYSTEM_NAME>` (substitua `<ECOSYSTEM_NAME>` pelo nome do seu processo).
3.  Busque as últimas alterações do repositório: `git pull origin main` (ou o nome da sua branch principal, se diferente).
4.  Instale/atualize quaisquer dependências novas ou modificadas: `npm install`
5.  Reinicie o bot com PM2: `pm2 restart <ECOSYSTEM_NAME>`

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
  - GitHub: [@Kaikygr](https://github.com/Kaikygr)
  - Contato: [WhatsApp](https://bit.ly/m/Kaally)

---

_Sinta-se à vontade para abrir Issues no GitHub para relatar bugs ou sugerir novas funcionalidades._
