#!/usr/bin/env bash

set -e

OUTPUT_DIR="project-export-full"
STRUCTURE_FILE="$OUTPUT_DIR/estructura.txt"
FILES_FILE="$OUTPUT_DIR/archivos.txt"
MARKDOWN_FILE="$OUTPUT_DIR/proyecto_completo.md"
PDF_FILE="$OUTPUT_DIR/proyecto_completo.pdf"

mkdir -p "$OUTPUT_DIR"

echo "Generando estructura completa..."
find . \
  -not -path "*/.git/*" \
  -not -path "*/project-export-full/*" \
  > "$STRUCTURE_FILE"

echo "Buscando todos los archivos..."
find . -type f \
  -not -path "*/.git/*" \
  -not -path "*/project-export-full/*" \
  -not -name ".DS_Store" \
  | sort > "$FILES_FILE"

echo "Construyendo Markdown completo..."
{
  echo "# Proyecto completo exportado"
  echo
  echo "## Estructura completa"
  echo
  echo '```'
  cat "$STRUCTURE_FILE"
  echo '```'
  echo
  echo "## Archivos completos con números de línea"
  echo
  echo "Formato: \`0001 | contenido\`"
} > "$MARKDOWN_FILE"

while IFS= read -r file; do
  echo "" >> "$MARKDOWN_FILE"
  echo "## $file" >> "$MARKDOWN_FILE"
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
    html) lang="html" ;;
    sh) lang="bash" ;;
    *) lang="" ;;
  esac

  if file "$file" | grep -qi "text"; then
    echo "\`\`\`$lang" >> "$MARKDOWN_FILE"
    nl -ba -w4 -s' | ' "$file" >> "$MARKDOWN_FILE"
    echo '```' >> "$MARKDOWN_FILE"
  else
    echo "_Archivo binario u no textual omitido en vista previa: $file_" >> "$MARKDOWN_FILE"
  fi
done < "$FILES_FILE"

echo "Generando PDF..."
pandoc "$MARKDOWN_FILE" -o "$PDF_FILE"

echo ""
echo "Listo:"
echo "Markdown: $MARKDOWN_FILE"
echo "PDF: $PDF_FILE"
