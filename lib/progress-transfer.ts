export type TransferStatus = "not_started" | "in_progress" | "completed" | "failed";

export interface TransferProgressState {
  status: TransferStatus;
  watchedTime: number;
  completedAt: Date | null;
}

export interface TransferLesson {
  id: string;
  title: string;
  type: string;
  orderIndex: number;
  module: {
    id: string;
    title: string;
    orderIndex: number;
  };
  progress: TransferProgressState | null;
}

export interface ProgressMapping {
  sourceLessonId: string;
  targetLessonId: string;
}

export type ProgressTransferConfidence =
  | "exact"
  | "unique_title"
  | "position"
  | "ambiguous"
  | "unmatched";

export interface ProgressTransferSuggestion {
  sourceLessonId: string;
  targetLessonId: string | null;
  confidence: ProgressTransferConfidence;
  selected: boolean;
}

export interface ProgressTransferPreview {
  suggestions: ProgressTransferSuggestion[];
  unmatchedSourceLessonIds: string[];
  unmatchedTargetLessonIds: string[];
}

export function normalizeTransferTitle(value: string): string {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/[«»„“”'"`.,:;!?()[\]{}\\/|_—–-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameTitleAndType(source: TransferLesson, target: TransferLesson): boolean {
  return (
    normalizeTransferTitle(source.title) === normalizeTransferTitle(target.title) &&
    source.type === target.type
  );
}

export function buildProgressTransferPreview(
  sourceLessons: TransferLesson[],
  targetLessons: TransferLesson[]
): ProgressTransferPreview {
  const usedTargetIds = new Set<string>();
  const suggestions: ProgressTransferSuggestion[] = [];

  for (const source of sourceLessons) {
    if (!source.progress || source.progress.status === "not_started") continue;

    const availableTargets = targetLessons.filter((target) => !usedTargetIds.has(target.id));
    const exactMatches = availableTargets.filter(
      (target) =>
        sameTitleAndType(source, target) &&
        normalizeTransferTitle(source.module.title) === normalizeTransferTitle(target.module.title)
    );

    if (exactMatches.length === 1) {
      usedTargetIds.add(exactMatches[0].id);
      suggestions.push({
        sourceLessonId: source.id,
        targetLessonId: exactMatches[0].id,
        confidence: "exact",
        selected: true,
      });
      continue;
    }

    if (exactMatches.length > 1) {
      suggestions.push({
        sourceLessonId: source.id,
        targetLessonId: null,
        confidence: "ambiguous",
        selected: false,
      });
      continue;
    }

    const titleMatches = availableTargets.filter((target) => sameTitleAndType(source, target));
    if (titleMatches.length === 1) {
      usedTargetIds.add(titleMatches[0].id);
      suggestions.push({
        sourceLessonId: source.id,
        targetLessonId: titleMatches[0].id,
        confidence: "unique_title",
        selected: true,
      });
      continue;
    }

    if (titleMatches.length > 1) {
      suggestions.push({
        sourceLessonId: source.id,
        targetLessonId: null,
        confidence: "ambiguous",
        selected: false,
      });
      continue;
    }

    const positionMatches = availableTargets.filter(
      (target) =>
        source.module.orderIndex === target.module.orderIndex &&
        source.orderIndex === target.orderIndex &&
        source.type === target.type
    );

    suggestions.push({
      sourceLessonId: source.id,
      targetLessonId: positionMatches.length === 1 ? positionMatches[0].id : null,
      confidence:
        positionMatches.length === 1
          ? "position"
          : positionMatches.length > 1
            ? "ambiguous"
            : "unmatched",
      selected: false,
    });
  }

  const selectedTargetIds = new Set(
    suggestions
      .filter((suggestion) => suggestion.selected && suggestion.targetLessonId)
      .map((suggestion) => suggestion.targetLessonId as string)
  );

  return {
    suggestions,
    unmatchedSourceLessonIds: suggestions
      .filter((suggestion) => !suggestion.selected)
      .map((suggestion) => suggestion.sourceLessonId),
    unmatchedTargetLessonIds: targetLessons
      .filter((lesson) => !selectedTargetIds.has(lesson.id))
      .map((lesson) => lesson.id),
  };
}

export function validateProgressMappings(
  mappings: ProgressMapping[],
  sourceLessons: Pick<TransferLesson, "id">[],
  targetLessons: Pick<TransferLesson, "id">[]
): void {
  const sourceIds = new Set(sourceLessons.map((lesson) => lesson.id));
  const targetIds = new Set(targetLessons.map((lesson) => lesson.id));
  const mappedSourceIds = new Set<string>();
  const mappedTargetIds = new Set<string>();

  for (const mapping of mappings) {
    if (!sourceIds.has(mapping.sourceLessonId)) {
      throw new Error("Исходный урок не принадлежит выбранному курсу");
    }
    if (!targetIds.has(mapping.targetLessonId)) {
      throw new Error("Новый урок не принадлежит выбранному курсу");
    }
    if (mappedSourceIds.has(mapping.sourceLessonId)) {
      throw new Error("Один исходный урок нельзя переносить несколько раз");
    }
    if (mappedTargetIds.has(mapping.targetLessonId)) {
      throw new Error("Один новый урок нельзя использовать несколько раз");
    }

    mappedSourceIds.add(mapping.sourceLessonId);
    mappedTargetIds.add(mapping.targetLessonId);
  }
}

const STATUS_RANK: Record<TransferStatus, number> = {
  not_started: 0,
  failed: 0,
  in_progress: 1,
  completed: 2,
};

export function mergeProgress(
  source: TransferProgressState,
  target: TransferProgressState | null
): TransferProgressState {
  if (!target) {
    return {
      status: source.status,
      watchedTime: source.watchedTime,
      completedAt: source.completedAt,
    };
  }

  const sourceWins = STATUS_RANK[source.status] > STATUS_RANK[target.status];
  const chosen = sourceWins ? source : target;
  const completedAt =
    chosen.status === "completed"
      ? chosen.completedAt ?? (source.status === "completed" ? source.completedAt : null)
      : null;

  return {
    status: chosen.status,
    watchedTime: Math.max(source.watchedTime, target.watchedTime),
    completedAt,
  };
}
