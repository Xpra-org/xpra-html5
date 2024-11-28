#!/usr/bin/env bash

# Ensure path is passed in
if [ -z "$1" ]; then
  echo "No argument supplied, please enter the filepath of the xpra-html5 project"

  exit 1
fi

# Ensure path passed in is a folder
if [ ! -d "$1" ]; then
  echo "$1 either does not exist or is not a folder, please enter the filepath of the xpra-html5 project"

  exit 1
fi

# Check if nix is installed, if it isn't, use the determinate nix installer
if command -v nix 2>&1 >/dev/null; then
  echo "Nix is installed, formatting..."
else
  echo "Nix is not installed, using Determinate Nix Installer..."

  curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | \
    sh -s -- install

  echo "Nix has been installed, formatting..."
fi

nix-shell $1/shell.nix --run "
  js-beautify --config $1/.jsbeautifyrc --type js -r $1/html5/js/*.js;
  js-beautify --config $1/.jsbeautifyrc --type html -r $1/html5/*.html;
  js-beautify --config $1/.jsbeautifyrc --type css -r $1/html5/css/*.css; 
"
