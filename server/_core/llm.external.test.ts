import { describe, expect, it } from "vitest";
import { buildOpenAiCompatibleUrl } from "./llm";

describe("buildOpenAiCompatibleUrl", () => {
  it("accepts a provider root URL", () => {
    expect(buildOpenAiCompatibleUrl("https://api.example.com", "chat/completions"))
      .toBe("https://api.example.com/v1/chat/completions");
  });

  it("does not duplicate an existing version path", () => {
    expect(buildOpenAiCompatibleUrl("https://api.example.com/v1/", "models"))
      .toBe("https://api.example.com/v1/models");
  });
});
