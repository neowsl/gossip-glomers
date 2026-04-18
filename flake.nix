{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };

        maelstrom-version = "0.2.3";
        maelstrom-url = "https://github.com/jepsen-io/maelstrom/releases/download/v${maelstrom-version}/maelstrom.tar.bz2";

        maelstrom-pkg = pkgs.stdenv.mkDerivation {
          pname = "maelstrom";
          version = maelstrom-version;
          src = pkgs.fetchurl {
            url = maelstrom-url;
            sha256 = "sha256-ISS2qma139Jz9eDxLJvULkqDZeu1vyx9ot4uO0LIVho=";
          };

          nativeBuildInputs = [ pkgs.makeWrapper ];

          installPhase = ''
            mkdir -p $out/bin
            mkdir -p $out/share/maelstrom
            cp -r . $out/share/maelstrom

            makeWrapper $out/share/maelstrom/maelstrom $out/bin/maelstrom \
              --set JAVA_HOME ${pkgs.openjdk17} \
              --prefix PATH : ${
                pkgs.lib.makeBinPath [
                  pkgs.openjdk17
                  pkgs.graphviz
                  pkgs.gnuplot
                ]
              }
          '';
        };
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            openjdk17
            graphviz
            gnuplot

            ruby

            maelstrom-pkg
          ];

          shellHook = ''
            echo "--- Maelstrom Development Environment ---"
            echo "JDK: $(java -version 2>&1 | head -n 1)"
            echo "Ruby: $(ruby --version)"
            echo "Maelstrom is available at 'maelstrom'"
          '';
        };
      }
    );
}
