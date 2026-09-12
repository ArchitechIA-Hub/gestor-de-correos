import { describe, it, expect } from "vitest";
import { describeGoogleApiError } from "./errors";

describe("describeGoogleApiError", () => {
  it("extrae error + error_description de un GaxiosError sin tocar el resto del objeto", () => {
    const fakeGaxiosError = {
      message: "invalid_grant",
      response: { data: { error: "invalid_grant", error_description: "Token has been expired or revoked." } },
      config: {
        body: new URLSearchParams({
          refresh_token: "1//super-secreto-no-debe-salir",
          client_secret: "otro-secreto",
        }),
      },
    };

    const result = describeGoogleApiError(fakeGaxiosError);

    expect(result).toBe("invalid_grant: Token has been expired or revoked.");
    expect(result).not.toContain("super-secreto");
    expect(result).not.toContain("client_secret");
  });

  it("cae al message plano cuando no hay response.data.error", () => {
    expect(describeGoogleApiError(new Error("algo genérico falló"))).toBe("algo genérico falló");
  });

  it("nunca revienta con valores no-objeto", () => {
    expect(describeGoogleApiError(null)).toBe("Error desconocido de la API de Google");
    expect(describeGoogleApiError("string suelto")).toBe("Error desconocido de la API de Google");
  });
});
