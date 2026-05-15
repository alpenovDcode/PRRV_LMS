// Tests for the scope-prefix parser. Covers every scope alias the
// engine and inline-actions code rely on, plus the legacy `vars.x`
// alias mapped to client.

import { describe, it, expect } from "vitest";
import { parseScopedKey } from "../scoped-key";

describe("parseScopedKey", () => {
  it("defaults to client when no prefix", () => {
    expect(parseScopedKey("email")).toEqual({ scope: "client", key: "email" });
  });

  it("parses client.x", () => {
    expect(parseScopedKey("client.email")).toEqual({ scope: "client", key: "email" });
  });

  it("parses project.x", () => {
    expect(parseScopedKey("project.brand")).toEqual({ scope: "project", key: "brand" });
  });

  it("parses deal.x", () => {
    expect(parseScopedKey("deal.utm")).toEqual({ scope: "deal", key: "utm" });
  });

  it("parses field.x", () => {
    expect(parseScopedKey("field.phone")).toEqual({ scope: "field", key: "phone" });
  });

  it("treats legacy vars.x as client.x", () => {
    expect(parseScopedKey("vars.city")).toEqual({ scope: "client", key: "city" });
  });

  it("supports nested keys after prefix", () => {
    expect(parseScopedKey("deal.http.status")).toEqual({ scope: "deal", key: "http.status" });
  });

  it("does NOT treat unknown prefix as scope", () => {
    expect(parseScopedKey("foo.bar")).toEqual({ scope: "client", key: "foo.bar" });
  });

  it("supports cyrillic keys", () => {
    expect(parseScopedKey("client.имя")).toEqual({ scope: "client", key: "имя" });
  });
});
