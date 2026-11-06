import type { ProtonAppId } from "./apps.ts";
import authenticator from "./glyphs/authenticator.svg";
import calendar from "./glyphs/calendar.svg";
import docs from "./glyphs/docs.svg";
import drive from "./glyphs/drive.svg";
import lumo from "./glyphs/lumo.svg";
import mail from "./glyphs/mail.svg";
import meet from "./glyphs/meet.svg";
import pass from "./glyphs/pass.svg";
import sheets from "./glyphs/sheets.svg";
import spaces from "./glyphs/spaces.svg";
import vpn from "./glyphs/vpn.svg";
import wallet from "./glyphs/wallet.svg";

/** Gradient ids are prefixed with `proton-<app>-glyph-` so glyphs can be inlined together. */
export const PROTON_APP_GLYPHS: Readonly<Record<ProtonAppId, string>> = {
    Mail: mail,
    Calendar: calendar,
    VPN: vpn,
    Drive: drive,
    Docs: docs,
    Sheets: sheets,
    Pass: pass,
    Wallet: wallet,
    Lumo: lumo,
    Meet: meet,
    Authenticator: authenticator,
    Spaces: spaces,
};
