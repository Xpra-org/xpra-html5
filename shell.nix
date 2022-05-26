with (import <nixpkgs> {});
mkShell {
  buildInputs = [ graphviz nodejs-18_x ];
}
