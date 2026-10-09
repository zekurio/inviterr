// Shared tw-animate-css motion so every overlay surface opens and closes the
// same way. Exits are shorter and ease-in so dismissing feels immediate.

// Anchored surfaces (menus, selects, popovers): fade and scale toward the
// trigger with a small nudge away from the side they open on.
export const floatingContentMotion =
  "duration-150 ease-out data-[state=closed]:duration-100 data-[state=closed]:ease-in data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-97 data-[state=closed]:zoom-out-97 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 motion-reduce:animate-none"

export const overlayMotion =
  "duration-200 ease-out data-[state=closed]:duration-150 data-[state=closed]:ease-in data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 motion-reduce:animate-none"

// Bottom sheet below sm, centered modal above. Timing matches overlayMotion
// so the backdrop and the panel finish together.
export const modalContentMotion =
  "duration-200 ease-out data-[state=closed]:duration-150 data-[state=closed]:ease-in data-[state=open]:animate-in data-[state=closed]:animate-out max-sm:data-[state=open]:slide-in-from-bottom max-sm:data-[state=closed]:slide-out-to-bottom sm:data-[state=open]:fade-in-0 sm:data-[state=closed]:fade-out-0 sm:data-[state=open]:zoom-in-97 sm:data-[state=closed]:zoom-out-97 motion-reduce:animate-none"
