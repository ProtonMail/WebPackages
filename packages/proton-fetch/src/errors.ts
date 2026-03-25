export const parseErrorBody = (json: unknown) => {
    let errorMessage = "";
    let errorCode = 0;
    let errorDetails: object = {};

    if (json && typeof json === "object") {
        errorMessage =
            "Error" in json && typeof json.Error === "string" ? json.Error : "";
        errorCode =
            "Code" in json && typeof json.Code === "number" ? json.Code : 0;
        errorDetails =
            "Details" in json &&
            typeof json.Details === "object" &&
            json.Details !== null
                ? json.Details
                : {};
    }

    return { message: errorMessage, code: errorCode, details: errorDetails };
};
