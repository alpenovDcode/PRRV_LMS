import { describe, expect, it } from "vitest";
import {
  buildProgressTransferPreview,
  initializeProgressMappings,
  mergeProgress,
  replaceProgressMapping,
  validateProgressMappings,
  type TransferLesson,
} from "./progress-transfer";

const completedAt = new Date("2026-08-01T10:00:00.000Z");

function lesson(
  id: string,
  overrides: Partial<TransferLesson> = {}
): TransferLesson {
  return {
    id,
    title: "Урок «Старт»",
    type: "video",
    orderIndex: 0,
    module: {
      id: `${id}-module`,
      title: "Модуль 1",
      orderIndex: 0,
    },
    progress: {
      status: "completed",
      watchedTime: 120,
      completedAt,
    },
    ...overrides,
  };
}

describe("buildProgressTransferPreview", () => {
  it("preselects an exact normalized module, title and type match", () => {
    const preview = buildProgressTransferPreview(
      [lesson("source")],
      [
        lesson("target", {
          title: "урок старт",
          module: { id: "target-module", title: "МОДУЛЬ 1", orderIndex: 0 },
          progress: null,
        }),
      ]
    );

    expect(preview.suggestions).toEqual([
      {
        sourceLessonId: "source",
        targetLessonId: "target",
        confidence: "exact",
        selected: true,
      },
    ]);
    expect(preview.unmatchedSourceLessonIds).toEqual([]);
    expect(preview.unmatchedTargetLessonIds).toEqual([]);
  });

  it("uses a unique title and type when module titles differ", () => {
    const preview = buildProgressTransferPreview(
      [lesson("source")],
      [
        lesson("target", {
          module: { id: "target-module", title: "Новая программа", orderIndex: 4 },
          progress: null,
        }),
      ]
    );

    expect(preview.suggestions[0]).toEqual({
      sourceLessonId: "source",
      targetLessonId: "target",
      confidence: "unique_title",
      selected: true,
    });
  });

  it("does not preselect ambiguous target titles", () => {
    const target = lesson("target-1", {
      module: { id: "target-module", title: "Новая программа", orderIndex: 1 },
      progress: null,
    });

    const preview = buildProgressTransferPreview(
      [lesson("source")],
      [target, { ...target, id: "target-2" }]
    );

    expect(preview.suggestions[0]).toEqual({
      sourceLessonId: "source",
      targetLessonId: null,
      confidence: "ambiguous",
      selected: false,
    });
    expect(preview.unmatchedSourceLessonIds).toEqual(["source"]);
    expect(preview.unmatchedTargetLessonIds).toEqual(["target-1", "target-2"]);
  });

  it("offers a same-position lesson without preselecting it", () => {
    const preview = buildProgressTransferPreview(
      [lesson("source", { title: "Старая тема" })],
      [lesson("target", { title: "Новая тема", progress: null })]
    );

    expect(preview.suggestions[0]).toEqual({
      sourceLessonId: "source",
      targetLessonId: "target",
      confidence: "position",
      selected: false,
    });
  });

  it("excludes lessons without started progress", () => {
    const preview = buildProgressTransferPreview(
      [
        lesson("empty", {
          progress: { status: "not_started", watchedTime: 0, completedAt: null },
        }),
        lesson("missing", { progress: null }),
      ],
      [lesson("target", { progress: null })]
    );

    expect(preview.suggestions).toEqual([]);
  });
});

describe("validateProgressMappings", () => {
  it("rejects reuse of the same target lesson", () => {
    expect(() =>
      validateProgressMappings(
        [
          { sourceLessonId: "source-1", targetLessonId: "target-1" },
          { sourceLessonId: "source-2", targetLessonId: "target-1" },
        ],
        [lesson("source-1"), lesson("source-2")],
        [lesson("target-1", { progress: null })]
      )
    ).toThrow("Один новый урок нельзя использовать несколько раз");
  });

  it("rejects lessons outside the selected courses", () => {
    expect(() =>
      validateProgressMappings(
        [{ sourceLessonId: "foreign", targetLessonId: "target-1" }],
        [lesson("source-1")],
        [lesson("target-1", { progress: null })]
      )
    ).toThrow("Исходный урок не принадлежит выбранному курсу");
  });
});

describe("mergeProgress", () => {
  it("never reduces existing completed target progress", () => {
    const targetCompletedAt = new Date("2026-07-01T10:00:00.000Z");

    expect(
      mergeProgress(
        { status: "in_progress", watchedTime: 30, completedAt: null },
        { status: "completed", watchedTime: 90, completedAt: targetCompletedAt }
      )
    ).toEqual({
      status: "completed",
      watchedTime: 90,
      completedAt: targetCompletedAt,
    });
  });

  it("copies a higher source status and keeps the maximum watched time", () => {
    expect(
      mergeProgress(
        { status: "completed", watchedTime: 120, completedAt },
        { status: "in_progress", watchedTime: 180, completedAt: null }
      )
    ).toEqual({
      status: "completed",
      watchedTime: 180,
      completedAt,
    });
  });
});

describe("curator mapping selection", () => {
  it("initializes only safe preselected suggestions", () => {
    expect(
      initializeProgressMappings([
        {
          sourceLessonId: "source-1",
          targetLessonId: "target-1",
          confidence: "exact",
          selected: true,
        },
        {
          sourceLessonId: "source-2",
          targetLessonId: "target-2",
          confidence: "position",
          selected: false,
        },
        {
          sourceLessonId: "source-3",
          targetLessonId: null,
          confidence: "unmatched",
          selected: false,
        },
      ])
    ).toEqual([{ sourceLessonId: "source-1", targetLessonId: "target-1" }]);
  });

  it("moves a target lesson to the curator-selected source without duplicates", () => {
    expect(
      replaceProgressMapping(
        [
          { sourceLessonId: "source-1", targetLessonId: "target-1" },
          { sourceLessonId: "source-2", targetLessonId: "target-2" },
        ],
        "source-2",
        "target-1"
      )
    ).toEqual([{ sourceLessonId: "source-2", targetLessonId: "target-1" }]);
  });
});
