"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { type ReactElement, useState } from "react";

export function CleanTooltip({
  children,
  label,
  shouldOpen = () => true,
}: {
  children: ReactElement;
  label: string;
  shouldOpen?: () => boolean;
}) {
  const [open, setOpen] = useState(false);
  const visible = open && shouldOpen();

  return (
    <Tooltip.Provider
      delayDuration={120}
      skipDelayDuration={0}
      disableHoverableContent
    >
      <Tooltip.Root
        open={visible}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen && shouldOpen());
        }}
      >
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="clean-tooltip tooltip-surface"
            side="bottom"
            align="center"
            sideOffset={10}
            collisionPadding={10}
            arrowPadding={12}
          >
            {label}
            <Tooltip.Arrow
              className="clean-tooltip-arrow tooltip-arrow"
              width={20}
              height={10}
            />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
