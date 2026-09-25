{
  pkgs,
  ...
}:
{
  packages =
    let
      web-deps = with pkgs; [
        nodejs-slim_24
        pnpm
      ];
    in
    web-deps;
}
