/** One server-sent event. Comments (`: keep-alive`) are not events and never come out. */
export type ServerEvent = { event: string; data: string };

/**
 * Reads server-sent events from a response body (WHATWG event stream format): `event:` and
 * `data:` fields, events ended by a blank line, `\n` or `\r\n` line ends, multi-line data
 * joined by `\n`. Used instead of EventSource, which can neither POST nor send a token.
 */
export async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<ServerEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event = "message";
  let data: string[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, "");
        buffer = buffer.slice(nl + 1);
        if (line === "") {
          if (data.length > 0) yield { event, data: data.join("\n") };
          event = "message";
          data = [];
        } else if (line.startsWith(":")) {
          // a comment: keeps proxies awake, means nothing
        } else {
          const colon = line.indexOf(":");
          const field = colon < 0 ? line : line.slice(0, colon);
          const raw = colon < 0 ? "" : line.slice(colon + 1);
          const text = raw.startsWith(" ") ? raw.slice(1) : raw;
          if (field === "event") event = text;
          else if (field === "data") data.push(text);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
