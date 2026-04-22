#!/usr/bin/env bash

set -e

OUTPUT_DIR="project-export"
STRUCTURE_FILE="$OUTPUT_DIR/estructura.txt"
FILES_FILE="$OUTPUT_DIR/archivos.txt"
MARKDOWN_FILE="$OUTPUT_DIR/proyecto.md"
PDF_FILE="$OUTPUT_DIR/proyecto.pdf"

mkdir -p "$OUTPUT_DIR"

echo "Generando estructura..."
find . -type d \
  -not -path "*/node_modules/*" \
  -not -path "*/.next/*" \
  -not -path "*/.git/*" \
  -not -path "*/dist/*" \
  -not -path "*/build/*" \
  -not -path "*/coverage/*" \
  -not -path "*/project-export/*" \
  | sed 's|[^/]*/|  |g' > "$STRUCTURE_FILE"

echo "Buscando archivos..."
find . -type f \
  \( -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" -o -name "*.json" -o -name "*.prisma" -o -name "*.md" -o -name "*.css" -o -name "*.sql" -o -name "*.yml" -o -name "*.yaml" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.next/*" \
  -not -path "*/.git/*" \
  -not -path "*/dist/*" \
  -not -path "*/build/*" \
  -not -path "*/coverage/*" \
  -not -path "*/project-export/*" \
  -not -name ".env" \
  -not -name ".env.local" \
  -not -name ".env.production" \
  -not -name ".env.development" \
  | sort > "$FILES_FILE"

echo "Construyendo Markdown..."
{
  echo "# Proyecto exportado"
  echo
  echo "## Estructura de carpetas"
  echo
  echo '```'
  cat "$STRUCTURE_FILE"
  echo '```'
  echo
  echo "## Código completo con números de línea"
  echo
  echo "Formato de líneas: \`0001 | código\`"
} > "$MARKDOWN_FILE"

while IFS= read -r file; do
  echo "" >> "$MARKDOWN_FILE"
  echo "### $file" >> "$MARKDOWN_FILE"
  echo "" >> "$MARKDOWN_FILE"

  ext="${file##*.}"
  case "$ext" in
    js) lang="javascript" ;;
    jsx) lang="javascript" ;;
    ts) lang="typescript" ;;
    tsx) lang="typescript" ;;
    json) lang="json" ;;
    prisma) lang="prisma" ;;
    md) lang="markdown" ;;
    css) lang="css" ;;
    sql) lang="sql" ;;
    yml|yaml) lang="yaml" ;;
    *) lang="" ;;
  esac

  echo "\`\`\`$lang" >> "$MARKDOWN_FILE"
  nl -ba -w4 -s' | ' "$file" >> "$MARKDOWN_FILE"
  echo '```' >> "$MARKDOWN_FILE"
done < "$FILES_FILE"

echo "Generando PDF..."
pandoc "$MARKDOWN_FILE" -o "$PDF_FILE"

echo ""
echo "Listo:"
echo "Markdown: $MARKDOWN_FILE"
echo "PDF: $PDF_FILE"
