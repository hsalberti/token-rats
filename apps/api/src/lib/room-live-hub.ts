/**
 * RoomLiveHub — Durable Object for per-room SSE fan-out.
 *
 * One instance per room code. Keeps a set of open SSE response writers.
 *
 * Routes:
 *   GET  /subscribe  — Returns a streaming SSE Response; adds the subscriber.
 *   POST /publish    — Accepts a JSON LiveEvent body; fans out to all subscribers.
 */

import type { LiveEvent } from "@token-rats/contracts";
import { LiveEvent as LiveEventSchema } from "@token-rats/contracts";

/** A single SSE subscriber, identified by its ReadableStream controller. */
interface Subscriber {
  controller: ReadableStreamDefaultController<Uint8Array>;
}

export class RoomLiveHub {
  private subscribers = new Set<Subscriber>();
  private readonly encoder = new TextEncoder();

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.endsWith("/subscribe")) {
      return this.handleSubscribe();
    }

    if (url.pathname.endsWith("/publish") && request.method === "POST") {
      return this.handlePublish(request);
    }

    return new Response("Not found", { status: 404 });
  }

  // ── /subscribe ──────────────────────────────────────────────────────────────

  private handleSubscribe(): Response {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    let subscriber: Subscriber | null = null;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        subscriber = { controller };
        self.subscribers.add(subscriber);
        // Initial keepalive comment so the browser knows the stream is alive
        controller.enqueue(self.encoder.encode(": connected\n\n"));
      },
      cancel() {
        if (subscriber) {
          self.subscribers.delete(subscriber);
          subscriber = null;
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // ── /publish ─────────────────────────────────────────────────────────────────

  private async handlePublish(request: Request): Promise<Response> {
    let event: LiveEvent;
    try {
      const raw: unknown = await request.json();
      event = LiveEventSchema.parse(raw);
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    this.fanout(event);
    return new Response(JSON.stringify({ fanned: this.subscribers.size }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── fanout ──────────────────────────────────────────────────────────────────

  /** Send a LiveEvent to all open SSE subscribers. */
  fanout(event: LiveEvent): void {
    const data = this.encoder.encode(
      `event: ${event.kind}\ndata: ${JSON.stringify(event.payload)}\n\n`,
    );
    const dead = new Set<Subscriber>();

    for (const sub of this.subscribers) {
      try {
        sub.controller.enqueue(data);
      } catch {
        // Controller is closed — the client disconnected
        dead.add(sub);
      }
    }

    for (const sub of dead) {
      this.subscribers.delete(sub);
    }
  }
}
