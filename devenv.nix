{
  pkgs,
  ...
}:
{
  packages =
    let
      web-deps = with pkgs; [
        nodejs-slim_24
        pnpm_12
      ];
    in
    web-deps;
}
