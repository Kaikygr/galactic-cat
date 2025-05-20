#!/bin/bash

# Sair imediatamente se um comando falhar, tratar variáveis não definidas como erro
# e garantir que o status de saída de um pipeline seja o do último comando a falhar.
set -e -u -o pipefail

# Definições de cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m' # Sem Cor
BOLD='\033[1m'

# Caminho para o arquivo JS principal da aplicação
# Ajuste este caminho se o seu arquivo principal for diferente
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
APP_JS_FILE="$SCRIPT_DIR/src/auth/connection.js"

# Exibe informações do package.json se disponível
PACKAGE_JSON_FILE="$SCRIPT_DIR/package.json"

if [ -f "$PACKAGE_JSON_FILE" ]; then
  # Ler nome e versão do package.json usando Node.js
  # O '|| ""' e try-catch garantem que não quebre se o campo não existir ou o JSON for inválido
  APP_NAME=$(node -p "try { require('$PACKAGE_JSON_FILE').name || '' } catch (e) { '' }")
  APP_VERSION=$(node -p "try { require('$PACKAGE_JSON_FILE').version || '' } catch (e) { '' }")
  
  # Obter versões do Node, npm e diretório atual
  # Usamos '2>/dev/null || echo "não encontrado"' para evitar que o script pare se o comando falhar
  NODE_VERSION_RAW=$(node -v 2>/dev/null || echo "Node não encontrado")
  NPM_VERSION_RAW=$(npm -v 2>/dev/null || echo "npm não encontrado")

  # Verificar ffmpeg
  if command -v ffmpeg &>/dev/null; then
    # Tenta obter a saída da versão; se o comando falhar, captura um marcador de falha.
    # ffmpeg -version envia para stderr, por isso 2>&1. head -n 1 para pegar só a primeira linha.
    FFMPEG_VERSION_OUTPUT=$( (ffmpeg -version 2>&1 | head -n 1) || echo "FALHA_CMD_FFMPEG_VERSION" )
    if [[ "$FFMPEG_VERSION_OUTPUT" == "FALHA_CMD_FFMPEG_VERSION" ]]; then
      FFMPEG_VERSION_RAW="Instalado (falha ao ler versão)"
    else
      # Tenta extrair a versão específica (ex: "6.0" ou "N-xxxxx-gxxxx")
      PARSED_FFMPEG_VERSION=$(echo "$FFMPEG_VERSION_OUTPUT" | sed -n 's/ffmpeg version \([^ ]*\).*/\1/p')
      if [[ -n "$PARSED_FFMPEG_VERSION" ]]; then
        FFMPEG_VERSION_RAW="$PARSED_FFMPEG_VERSION"
      else
        FFMPEG_VERSION_RAW="Instalado (info: $FFMPEG_VERSION_OUTPUT)" # Fallback para a linha completa se o parse falhar
      fi
    fi
  else
    FFMPEG_VERSION_RAW="não encontrado"
  fi

  # Verificar webpmux
  if command -v webpmux &>/dev/null; then
    # webpmux -version pode enviar para stdout ou stderr. head -n 1 para simplificar.
    WEBPMAX_VERSION_OUTPUT=$( (webpmux -version 2>&1 | head -n 1) || echo "FALHA_CMD_WEBPMAX_VERSION" )
    if [[ "$WEBPMAX_VERSION_OUTPUT" == "FALHA_CMD_WEBPMAX_VERSION" ]]; then
      WEBPMAX_VERSION_RAW="Instalado (falha ao ler versão)"
    else
      # Tenta extrair a versão no formato X.Y.Z ou X.Y
      PARSED_WEBPMAX_VERSION=$(echo "$WEBPMAX_VERSION_OUTPUT" | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -n 1)
      if [[ -n "$PARSED_WEBPMAX_VERSION" ]]; then
        WEBPMAX_VERSION_RAW="$PARSED_WEBPMAX_VERSION"
      else
        # Fallback para awk se grep não encontrar o padrão X.Y.Z (ex: "WebP Mux Utility version 1.2.0")
        PARSED_WEBPMAX_VERSION_AWK=$(echo "$WEBPMAX_VERSION_OUTPUT" | awk '/version/{print $NF}')
        if [[ -n "$PARSED_WEBPMAX_VERSION_AWK" ]]; then
            WEBPMAX_VERSION_RAW="$PARSED_WEBPMAX_VERSION_AWK"
        else
            WEBPMAX_VERSION_RAW="Instalado (info: $WEBPMAX_VERSION_OUTPUT)" # Fallback para a linha completa
        fi
      fi
    fi
  else
    WEBPMAX_VERSION_RAW="não encontrado"
  fi

  CURRENT_DIR=$(pwd)

  if [ -n "$APP_NAME" ]; then
    printf "\n"
    printf "${CYAN}==================================================${NC}\n"
    if [ -n "$APP_VERSION" ]; then
      printf "${CYAN}  App:     ${BOLD}%s${NC} ${CYAN}v%s${NC}\n" "$APP_NAME" "$APP_VERSION"
    else
      printf "${CYAN}  App:     ${BOLD}%s${NC}\n" "$APP_NAME"
    fi
    printf "${CYAN}--------------------------------------------------${NC}\n"
    printf "${CYAN}  Node:    ${BOLD}%s${NC}\n" "$NODE_VERSION_RAW"
    printf "${CYAN}  npm:     ${BOLD}%s${NC}\n" "$NPM_VERSION_RAW"
    printf "${CYAN}  ffmpeg:  ${BOLD}%s${NC}\n" "$FFMPEG_VERSION_RAW"
    printf "${CYAN}  webpmux: ${BOLD}%s${NC}\n" "$WEBPMAX_VERSION_RAW"
    printf "${CYAN}--------------------------------------------------${NC}\n" # Linha separadora adicional
    printf "${CYAN}  Rodando: ${BOLD}%s${NC}\n" "$CURRENT_DIR"
    printf "${CYAN}==================================================${NC}\n\n"
  fi
else
  printf "${YELLOW}Aviso: package.json não encontrado em '%s'. Não foi possível exibir nome/versão.${NC}\n\n" "$PACKAGE_JSON_FILE" >&2
fi

# Pergunta ao usuário em qual modo iniciar
while true; do
  # shellcheck disable=SC2059
  printf "${YELLOW}Escolha uma opção:${NC}\n"
  printf "  ${CYAN}1)${NC} ${BOLD}Production${NC}  - Inicia a aplicação em modo de produção (otimizado).\n"
  printf "  ${CYAN}2)${NC} ${BOLD}Development${NC} - Inicia a aplicação em modo de desenvolvimento (com mais logs/debug).\n"
  printf "  ${CYAN}3)${NC} ${BOLD}Limpar${NC}      - Apaga os dados temporários de conexão da pasta 'src/auth/temp'.\n"
  printf "${YELLOW}Digite o número da opção desejada: ${NC}"
  read -r user_choice

  case "$user_choice" in
    1 | production) # Aceita '1' ou 'production'
      NODE_ENV="production"
      # shellcheck disable=SC2059
      printf "${GREEN}Modo de produção selecionado.${NC}\n"
      break
      ;;
    2 | development) # Aceita '2' ou 'development'
      NODE_ENV="development"
      # shellcheck disable=SC2059
      printf "${GREEN}Modo de desenvolvimento selecionado.${NC}\n"
      break
      ;;
    3 | limpar) # Aceita '3' ou 'limpar'
      TEMP_DIR="$SCRIPT_DIR/src/auth/temp"
      # shellcheck disable=SC2059
      printf "${CYAN}Verificando pasta de dados temporários: '%s'...${NC}\n" "$TEMP_DIR"
      if [ -d "$TEMP_DIR" ]; then
        # shellcheck disable=SC2059
        printf "${CYAN}Limpando dados de conexão em '%s'...${NC}\n" "$TEMP_DIR"
        # Adiciona uma confirmação antes de limpar
        printf "${YELLOW}Tem certeza que deseja apagar todos os dados em '%s'? (s/N): ${NC}" "$TEMP_DIR"
        read -r confirm_choice
        if [[ "$confirm_choice" =~ ^[Ss]$ ]]; then
        # Verifica se o diretório não está vazio antes de tentar limpar
        if [ -n "$(ls -A "$TEMP_DIR")" ]; then
            # Remove todo o conteúdo da pasta de forma segura (arquivos, pastas, arquivos ocultos)
            find "$TEMP_DIR" -mindepth 1 -delete
            # shellcheck disable=SC2059
            printf "${GREEN}Dados de conexão em '%s' limpos com sucesso.${NC}\n\n" "$TEMP_DIR"
        else
            # shellcheck disable=SC2059
            printf "${YELLOW}A pasta '%s' já está vazia. Nada a fazer.${NC}\n\n" "$TEMP_DIR"
        fi
        else
          printf "${YELLOW}Operação de limpeza cancelada.${NC}\n\n"
        fi
      else
        # shellcheck disable=SC2059
        printf "${YELLOW}A pasta de dados temporários '%s' não existe. Nada a limpar.${NC}\n\n" "$TEMP_DIR"
      fi
      continue # Volta ao início do loop para perguntar novamente
      ;;

    *)
      # shellcheck disable=SC2059
      printf "${RED}Opção inválida: '%s'. Por favor, escolha uma das opções listadas (1, 2 ou 3).${NC}\n\n" "$user_choice" >&2
      ;;
  esac
done
export NODE_ENV

# Verifica se o arquivo JS existe
if [ ! -f "$APP_JS_FILE" ]; then
  # shellcheck disable=SC2059
  printf "${RED}Erro: Arquivo da aplicação não encontrado em '%s'${NC}\n" "$APP_JS_FILE" >&2
  exit 1
fi
# shellcheck disable=SC2059
printf "${GREEN}Iniciando a aplicação em modo '%s'...${NC}\n" "$NODE_ENV"
# Executa a aplicação Node.js
node "$APP_JS_FILE"
