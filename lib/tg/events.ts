// Event tracker — single fire-and-forget entrypoint used everywhere
// in the bot platform. Writes synchronously to the DB; if the call
// path is hot, callers should not `await` (errors are swallowed).

import { db } from "../db";

export type TgEventType =
  | "subscriber.created"
  | "subscriber.blocked_bot"
  | "subscriber.unblocked_bot"
  | "subscriber.tag_added"
  | "subscriber.tag_removed"
  | "subscriber.variable_set"
  | "message.received"
  | "message.sent"
  | "message.send_failed"
  | "button.clicked"
  | "flow.entered"
  | "flow.node_executed"
  | "flow.completed"
  | "flow.failed"
  | "flow.cancelled"
  | "broadcast.started"
  | "broadcast.finished"
  | "broadcast.delivered"
  | "broadcast.failed"
  | "link.clicked";

export interface TrackEventInput {
  type: TgEventType | string;
  botId?: string | null;
  subscriberId?: string | null;
  properties?: Record<string, unknown>;
}

export async function trackEvent(input: TrackEventInput): Promise<void> {
  try {
    await db.tgEvent.create({
      data: {
        type: input.type,
        botId: input.botId ?? undefined,
        subscriberId: input.subscriberId ?? undefined,
        properties: (input.properties ?? {}) as object,
      },
    });
  } catch (e) {
    // Never let analytics writes break a request. Log to console
    // and move on; the existing ErrorLog channel is reserved for
    // higher-signal failures.
    console.error("[tg/events] trackEvent failed", input.type, e);
  }
}
