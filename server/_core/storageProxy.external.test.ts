import { describe, expect, it } from "vitest";
import { buildExternalAssetUrl } from "./storageProxy";

describe("buildExternalAssetUrl", () => {
  it("joins a storage prefix and a legacy storage key safely", () => {
    expect(buildExternalAssetUrl("https://assets.example.com/pitdesk", "/logo.png"))
      .toBe("https://assets.example.com/pitdesk/logo.png");
  });

  it("rejects path traversal keys", () => {
    expect(() => buildExternalAssetUrl("https://assets.example.com/pitdesk", "../private.txt"))
      .toThrow("Invalid storage key");
  });
});
