"use client";

import { useEffect, useRef, useState, type IframeHTMLAttributes, type ReactElement } from "react";
import { readerMessage, type ReaderDecisions } from "./messages.js";

/**
 * The default sandbox runs the reader runtime and lets links open in a new
 * tab, with an opaque origin so the artifact cannot reach the host page.
 * Picks then last for the session only; add allow-same-origin for trusted
 * artifacts whose picks should persist in the reader's storage.
 */
export const DEFAULT_SANDBOX = "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-modals";

export interface DossierFrameProps
  extends Omit<IframeHTMLAttributes<HTMLIFrameElement>, "srcDoc" | "sandbox" | "children" | "title"> {
  /** The artifact HTML, from renderDossier or a file dossier build wrote. */
  html: string;
  /** The frame's accessible name. */
  title?: string;
  /** Grow the frame to the page's height as the reader reports it. Default true. */
  autoHeight?: boolean;
  /** Height in pixels until the page reports its own. Default 640. */
  initialHeight?: number;
  /** Sandbox tokens; see DEFAULT_SANDBOX. */
  sandbox?: string;
  /** Called with the reader's decisions once on load and on every change. */
  onDecisions?: (decisions: ReaderDecisions) => void;
}

/** Renders a Dossier artifact in an isolated frame, sized to its content. */
export function DossierFrame({
  html,
  title = "Dossier",
  autoHeight = true,
  initialHeight = 640,
  sandbox = DEFAULT_SANDBOX,
  onDecisions,
  style,
  ...rest
}: DossierFrameProps): ReactElement {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(initialHeight);
  const decisionsHandler = useRef(onDecisions);

  useEffect(() => {
    decisionsHandler.current = onDecisions;
  }, [onDecisions]);

  useEffect(() => {
    function listen(event: MessageEvent): void {
      const target = frame.current;
      if (!target || event.source !== target.contentWindow) return;
      const message = readerMessage(event.data);
      if (!message) return;
      if (message.type === "dossier:height") {
        if (autoHeight) setHeight(message.height);
      } else {
        decisionsHandler.current?.(message.decisions);
      }
    }
    window.addEventListener("message", listen);
    return () => window.removeEventListener("message", listen);
  }, [autoHeight]);

  return (
    <iframe
      ref={frame}
      title={title}
      srcDoc={html}
      sandbox={sandbox}
      allow="clipboard-write"
      style={{ display: "block", width: "100%", border: 0, ...(autoHeight ? { height } : {}), ...style }}
      {...rest}
    />
  );
}
