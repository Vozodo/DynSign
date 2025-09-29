#!/bin/bash

# check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "jq not installed."
    exit 1
fi

# get version number from manifest
version=$(jq -r '.version' manifest.json)

base_name="DynSign"
zip_name="${base_name}-v${version}.zip"
xpi_name="${base_name}-v${version}.xpi"
temp_dir="temp_zip"

mkdir -p "$temp_dir"

rsync -av --progress \
  --exclude='.git/' \
  --exclude='docs/' \
  --exclude-from='.gitignore' \
  --exclude='build-release.sh' \
  --exclude='.gitignore' \
  --exclude='.gitkeep' \
  . "$temp_dir" --exclude="$temp_dir"

cd "$temp_dir" || exit 1
zip -r "../$zip_name" . > /dev/null
cd ..

echo "Content of $zip_name"
unzip -l "$zip_name"

mv "$zip_name" "$xpi_name"
echo "XPI-File created: $xpi_name"

rm -rf "$temp_dir"
