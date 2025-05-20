#!/bin/bash

# Verifica se o argumento de ambiente foi fornecido
if [ -z "$1" ]; then
  echo "Uso: $0 <production|development>"
  echo "Exemplo: $0 development"
  exit 1
fi

# Define o ambiente com base no argumento
case "$1" in
  production)
    export NODE_ENV="production"
    ;;
  development)
    export NODE_ENV="development"
    ;;
  *)
    echo "Ambiente inválido: '$1'. Use 'production' ou 'development'."
    exit 1
    ;;
esac

# Caminho para o arquivo JS principal da aplicação
# Ajuste este caminho se o seu arquivo principal for diferente
APP_JS_FILE="./src/auth/connection.js"

# Verifica se o arquivo JS existe
if [ ! -f "$APP_JS_FILE" ]; then
  echo "Erro: Arquivo da aplicação não encontrado em '$APP_JS_FILE'"
  exit 1
fi

echo "Iniciando a aplicação em modo '$NODE_ENV'..."
# Executa a aplicação Node.js
node "$APP_JS_FILE"
