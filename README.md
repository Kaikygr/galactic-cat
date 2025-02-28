# Galactic-Cat - Chatbot para WhatsApp

<p align="center">
  <img src="https://static.tumblr.com/f76d0c37c94757b5b0c3cceb73a1664b/ftrdqzb/cZSorgwba/tumblr_static_tumblr_static_akjaybqi5ggg8o4sgwowggogc_640.gif" alt="Banner">
</p>

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/Node.js-%3E=14-blue.svg)](https://nodejs.org/)

_Galactic-Cat_ é um chatbot open-source para integração com o WhatsApp, desenvolvido em _Node.js_. Ele utiliza a API _@whiskeysockets/baileys_ e um banco de dados _SQLite_ para armazenar e gerenciar as interações. Este projeto é ideal para quem busca criar automações e interações personalizadas no WhatsApp de forma simples e eficiente.

## Funcionalidades

- **Envio de mensagens automáticas**: Respostas personalizadas para interações.
- **Gerenciamento de mídias**: Envio e recebimento de imagens, vídeos e áudios.
- **Banco de dados SQLite**: Armazenamento de dados de usuários e interações.
- **Integração com WhatsApp**: Usando a API @whiskeysockets/baileys para comunicação eficiente.
- **Badges e informações visuais**: Facilita a identificação de status.
- **Melhorias na integração**: Melhor desempenho e novas funcionalidades no gerenciamento de interações.

### Tecnologias Utilizadas

- **Node.js**: Plataforma de desenvolvimento JavaScript.
- **SQLite**: Banco de dados leve e eficiente.
- **@whiskeysockets/baileys**: API para integração com o WhatsApp.

### Arquitetura do Projeto

O projeto é estruturado da seguinte forma:

- **src/**: Contém o código-fonte do chatbot.
  - **index.js**: Ponto de entrada do aplicativo.
  - **handlers/**: Contém os manipuladores de eventos do WhatsApp.
  - **services/**: Contém os serviços que interagem com o banco de dados e outras APIs.
  - **utils/**: Contém utilitários e funções auxiliares.
- **config/**: Contém arquivos de configuração.
- **database/**: Contém o banco de dados SQLite.

### Como Rodar o Projeto

1. **Clone o repositório:**

   ```bash
   git clone https://github.com/Kaikygr/galactic-cat.git
   cd galactic-cat
   ```

2. **Instale as dependências:**

   ```bash
   npm install
   ```

3. **Configuração do ambiente:**

   Adicione suas configurações no arquivo `.env` com as credenciais necessárias para a API WhatsApp.

4. **Inicie o chatbot:**

   ```bash
   npm start
   ```

### Contribuições

Contribuições são bem-vindas! Para adicionar novas funcionalidades, corrija bugs ou melhore a documentação, basta criar uma branch e submeter um pull request.

## Informações Adicionais

Nesta versão, o Galactic-Cat traz melhorias na integração com o WhatsApp, 
oferecendo um melhor desempenho e novas funcionalidades no gerenciamento de interações.
• Agora o bot inclui badges e informações visuais para facilitar a identificação de status.
• Maior explicação sobre as funcionalidades e a arquitetura do projeto foi adicionada
para auxiliar tanto em contribuições quanto no uso da ferramenta.

### Autor

- **Kaikygr**  
  [GitHub: Kaikygr](https://github.com/Kaikygr)

### Licença

Este projeto é licenciado sob a [MIT License](LICENSE)