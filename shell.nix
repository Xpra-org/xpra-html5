let
  nixpkgs = fetchTarball "https://github.com/NixOS/nixpkgs/tarball/nixos-24.05";
  pkgs = import nixpkgs { };
in pkgs.mkShell {
  buildInputs = with pkgs; [ nodePackages.js-beautify ];
}
