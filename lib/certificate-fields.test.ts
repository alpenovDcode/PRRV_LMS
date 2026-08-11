import { describe, expect, it } from "vitest";
import { resolveFullNameField } from "./certificate-fields";

describe("resolveFullNameField", () => {
  it("keeps the full-name field visible even for legacy templates marked hidden", () => {
    expect(
      resolveFullNameField({
        fullName: {
          x: "600",
          y: 420,
          fontSize: "48",
          color: "#112233",
          align: "center",
          hidden: true,
        },
      })
    ).toEqual({
      x: 600,
      y: 420,
      fontSize: 48,
      color: "#112233",
      align: "center",
    });
  });

  it("rejects a template without a configured full-name field", () => {
    expect(() => resolveFullNameField({})).toThrow("не настроено поле ФИО");
  });

  it("rejects invalid coordinates instead of issuing a blank certificate", () => {
    expect(() =>
      resolveFullNameField({
        fullName: { x: "oops", y: 200, fontSize: 48, align: "center" },
      })
    ).toThrow("координаты поля ФИО");
  });
});
