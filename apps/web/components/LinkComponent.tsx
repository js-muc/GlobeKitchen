// apps/web/src/components/LinkComponent.tsx
"use client";

import React, { forwardRef } from "react";
import NextLink, { type LinkProps as NextLinkProps } from "next/link";

/**
 * Utility to merge class names safely.
 */
function cx(...parts: Array<string | undefined | false | null>) {
  return parts.filter(Boolean).join(" ");
}

type AnchorExtras = Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
>;

type LinkComponentProps = NextLinkProps &
  AnchorExtras & {
    /** Extra focus styles (enabled by default) */
    enableFocusRing?: boolean;
    /** Optional aria-label alias */
    ariaLabel?: string;
  };

/**
 * Responsive, accessible Link wrapper for Next.js.
 *
 * - Renders a single <a> (via Next.js <Link>) to avoid nested-anchor hydration errors.
 * - Pass any Tailwind classes via `className` for layout/responsiveness (e.g. `block w-full sm:w-auto`).
 * - Automatically sets rel="noopener noreferrer" when target="_blank" unless you provide a rel.
 * - For external URLs you may also set target="_blank" explicitly.
 */
const LinkComponent = forwardRef<HTMLAnchorElement, LinkComponentProps>(
  (
    {
      href,
      children,
      className,
      prefetch,
      replace,
      scroll,
      shallow,
      passHref, // unused in Next 13+, but kept for typing compatibility
      locale,
      target,
      rel,
      onClick,
      onMouseEnter,
      onMouseLeave,
      onTouchStart,
      onFocus,
      onBlur,
      "aria-label": ariaLabelFromProp,
      ariaLabel,
      enableFocusRing = true,
      ...anchorProps
    },
    ref
  ) => {
    // Auto-apply safe rel for new-tab links if not provided
    const computedRel =
      target === "_blank" ? rel ?? "noopener noreferrer" : rel;

    const focusRing = enableFocusRing
      ? "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      : undefined;

    const classes = cx(className, focusRing);

    return (
      <NextLink
        href={href}
        prefetch={prefetch}
        replace={replace}
        scroll={scroll}
        shallow={shallow}
        locale={locale}
        className={classes}
        target={target}
        rel={computedRel}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onTouchStart={onTouchStart}
        onFocus={onFocus}
        onBlur={onBlur}
        aria-label={ariaLabel ?? ariaLabelFromProp}
        ref={ref}
        {...anchorProps}
      >
        {children}
      </NextLink>
    );
  }
);

LinkComponent.displayName = "LinkComponent";

export default LinkComponent;
