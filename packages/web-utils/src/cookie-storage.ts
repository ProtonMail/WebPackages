export const CookieSameSiteAttributeEnum = {
    Lax: "lax",
    Strict: "strict",
    None: "none",
};

export type CookieSameSiteAttributeType =
    (typeof CookieSameSiteAttributeEnum)[keyof typeof CookieSameSiteAttributeEnum];

export class CookieStorage {
    public setCookie({
        cookieName,
        cookieValue: maybeCookieValue,
        expirationDate: maybeExpirationDate,
        path,
        cookieDomain,
        samesite = CookieSameSiteAttributeEnum.Lax,
        secure = true,
    }: {
        cookieName: string;
        cookieValue: string | undefined;
        cookieDomain?: string;
        expirationDate?: string;
        path?: string;
        secure?: boolean;
        samesite?: CookieSameSiteAttributeType;
    }) {
        const cookieValue = maybeCookieValue ?? "";

        let expirationDate = maybeExpirationDate;

        if (expirationDate === "max") {
            /* https://en.wikipedia.org/wiki/Year_2038_problem */
            expirationDate = new Date(2147483647000).toUTCString();
        }

        expirationDate =
            maybeCookieValue === undefined
                ? new Date(0).toUTCString()
                : expirationDate;

        document.cookie = [
            `${cookieName}=${cookieValue}`,
            expirationDate && `expires=${expirationDate}`,
            cookieDomain && `domain=${cookieDomain}`,
            path && `path=${path}`,
            secure && "secure",
            samesite && `samesite=${samesite}`,
        ]
            .filter((value) => !!value)
            .join(";");
    }

    public deleteCookie(cookieName: string) {
        this.setCookie({
            cookieName,
            cookieValue: undefined,
            path: "/",
        });
    }

    public getCookies = (cookies = document.cookie): string[] => {
        try {
            return cookies.split(";").map((item) => item.trim());
        } catch {
            return [];
        }
    };

    public getCookie = (name: string, cookies = document.cookie) => {
        const prefix = `${name}=`;
        const match = this.getCookies(cookies).find((item) =>
            item.startsWith(prefix),
        );
        return match?.slice(prefix.length);
    };
}
