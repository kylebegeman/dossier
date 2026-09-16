import React from "react";
import { motion } from "motion/react";
import { Block } from "./blocks";
import type { DossierModel } from "./types";

/**
 * Live React document, renders a model's blocks for mounting inside a React/Next app
 * (import the core `CSS` once at your app root for the `ds-` classes).
 *
 * With `animate`, top-level blocks reveal on scroll via Motion. This path is for
 * **hydrated** usage (the client runs React); for a static, no-JS-required file use the
 * Node generator or `renderDossier()`. Honors `prefers-reduced-motion` automatically.
 */
export const DossierDocument: React.FC<{
  model: DossierModel;
  animate?: boolean;
  className?: string;
}> = ({ model, animate, className }) => {
  const blocks = model.blocks || [];
  return (
    <div className={className ?? "ds-content"}>
      {blocks.map((b, i) =>
        animate ? (
          <motion.div
            key={b.id || i}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "0px 0px -6% 0px" }}
            transition={{ duration: 0.45, ease: [0.2, 0, 0, 1], delay: Math.min(i * 0.04, 0.2) }}
          >
            <Block b={b} />
          </motion.div>
        ) : (
          <Block b={b} key={b.id || i} />
        )
      )}
    </div>
  );
};
