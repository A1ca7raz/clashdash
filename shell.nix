{ pkgs ? import <nixpkgs> {}, nur ? import <nurpkgs> {} }:
with pkgs; mkShell {
  packages = [
    nodejs
    corepack
    chromium
    mihomo
  ];
}
