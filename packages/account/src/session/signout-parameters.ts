export const serializeUsers = (users: string[]) => {
    return new TextEncoder()
        .encode(JSON.stringify(users.map((id) => ({ id }))))
        .toBase64({ alphabet: "base64url", omitPadding: true });
};
