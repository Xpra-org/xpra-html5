with (import <nixpkgs> {});
mkShell {
  buildInputs = [ nodejs-18_x ];
}
