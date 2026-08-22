import { describe, expect, it } from "vitest";
import { selectEmailTransport } from "./email";

describe("selectEmailTransport", () => {
  it("prefers an owner-controlled Resend configuration", () => {
    expect(selectEmailTransport({
      resendApiKey: "re_test",
      emailFrom: "alerts@example.com",
      forgeApiUrl: "https://managed.example.com",
      forgeApiKey: "managed-key",
    })).toBe("resend");
  });

  it("retains managed email compatibility until an external key is set", () => {
    expect(selectEmailTransport({
      forgeApiUrl: "https://managed.example.com",
      forgeApiKey: "managed-key",
    })).toBe("forge");
  });

  it("disables delivery cleanly when no sender is configured", () => {
    expect(selectEmailTransport({})).toBe("none");
  });
});
