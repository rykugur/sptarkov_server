let pkgs = import <nixpkgs> { };
in pkgs.mkShell {
  buildInputs = with pkgs; [ fnm ];

  shellHook = ''
    eval $(fnm env)
    fnm install 22.12.0
    fnm use 22.12.0
  '';
}
