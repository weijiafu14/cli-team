/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * useAutoScroll - Auto-scroll hook with user scroll detection
 * Uses Virtuoso's native followOutput for streaming auto-scroll,
 * only calls scrollToIndex for user-initiated actions (send message, click button).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { VirtuosoHandle } from 'react-virtuoso';
import type { TMessage } from '@/common/chatLib';

// Ignore scroll events within this window after a programmatic scroll (ms)
const PROGRAMMATIC_SCROLL_GUARD_MS = 150;

interface UseAutoScrollOptions {
  /** Message list for detecting new messages */
  messages: TMessage[];
  /** Total item count for scroll target */
  itemCount: number;
  /** Optional initial scroll target for the first DB-backed load */
  initialScrollTargetIndex?: number | 'LAST';
}

interface UseAutoScrollReturn {
  /** Ref to attach to Virtuoso component */
  virtuosoRef: React.RefObject<VirtuosoHandle | null>;
  /** Scroll event handler for Virtuoso onScroll */
  handleScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  /** Virtuoso atBottomStateChange callback */
  handleAtBottomStateChange: (atBottom: boolean) => void;
  /** Virtuoso followOutput callback for streaming auto-scroll */
  handleFollowOutput: (isAtBottom: boolean) => false | 'auto';
  /** Whether to show scroll-to-bottom button */
  showScrollButton: boolean;
  /** Manually scroll to bottom (e.g., when clicking button) */
  scrollToBottom: (behavior?: 'smooth' | 'auto') => void;
  /** Hide the scroll button */
  hideScrollButton: () => void;
}

export function useAutoScroll({
  messages,
  itemCount,
  initialScrollTargetIndex,
}: UseAutoScrollOptions): UseAutoScrollReturn {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Refs for scroll control
  const userScrolledRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const previousListLengthRef = useRef(messages.length);
  const lastProgrammaticScrollTimeRef = useRef(0);
  const hasScrolledInitialRef = useRef(false);

  // Scroll to bottom helper - only for user messages and button clicks
  const scrollToBottom = useCallback(
    (behavior: 'smooth' | 'auto' = 'smooth') => {
      if (!virtuosoRef.current) return;

      lastProgrammaticScrollTimeRef.current = Date.now();
      virtuosoRef.current.scrollToIndex({
        index: itemCount - 1,
        behavior,
        align: 'end',
      });
    },
    [itemCount]
  );

  // Virtuoso native followOutput - handles streaming auto-scroll internally
  // without external scrollToIndex calls that cause jitter
  const handleFollowOutput = useCallback((isAtBottom: boolean): false | 'auto' => {
    if (userScrolledRef.current || !isAtBottom) return false;
    return 'auto';
  }, []);

  // Reliable bottom state detection from Virtuoso
  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    setShowScrollButton(!atBottom);

    if (atBottom) {
      userScrolledRef.current = false;
    }
  }, []);

  // Detect user scrolling up
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const currentScrollTop = target.scrollTop;

    // Ignore scroll events shortly after a programmatic scroll to avoid
    // Virtuoso's internal layout adjustments being misdetected as user scroll
    if (Date.now() - lastProgrammaticScrollTimeRef.current < PROGRAMMATIC_SCROLL_GUARD_MS) {
      lastScrollTopRef.current = currentScrollTop;
      return;
    }

    const delta = currentScrollTop - lastScrollTopRef.current;
    if (delta < -10) {
      userScrolledRef.current = true;
    }

    lastScrollTopRef.current = currentScrollTop;
  }, []);

  // Force scroll when user sends a message, and optionally on initial DB load
  useEffect(() => {
    const currentListLength = messages.length;
    const prevLength = previousListLengthRef.current;
    const isNewMessage = currentListLength > prevLength;
    const isInitialLoad = initialScrollTargetIndex !== undefined && prevLength === 0 && currentListLength > 0;
    // Handle first mount with preloaded messages (e.g., cached DB data available immediately)
    const isFirstMountWithPreload =
      initialScrollTargetIndex !== undefined && !hasScrolledInitialRef.current && currentListLength > 0;

    previousListLengthRef.current = currentListLength;

    if (!isNewMessage && !isFirstMountWithPreload) return;

    if (isFirstMountWithPreload) {
      hasScrolledInitialRef.current = true;
    }

    const lastMessage = messages[messages.length - 1];

    // User sent a message - force scroll regardless of userScrolled state
    // Optionally enable the same behavior for the first DB-backed load in
    // child agent conversations, so opening the child room can jump to a more
    // meaningful initial target (e.g. latest right-side wakeup message).
    if (lastMessage?.position === 'right' || isInitialLoad || isFirstMountWithPreload) {
      userScrolledRef.current = false;
      const targetIndex = isInitialLoad || isFirstMountWithPreload ? initialScrollTargetIndex! : 'LAST';
      const doScroll = () => {
        if (virtuosoRef.current) {
          lastProgrammaticScrollTimeRef.current = Date.now();
          virtuosoRef.current.scrollToIndex({
            index: targetIndex,
            behavior: 'auto',
            align: 'end',
          });
        }
      };
      if (isFirstMountWithPreload || isInitialLoad) {
        // For initial load, scroll multiple times with increasing delays
        // to handle large lists where Virtuoso needs time to stabilize
        setTimeout(doScroll, 100);
        setTimeout(doScroll, 500);
        setTimeout(doScroll, 1500);
        setTimeout(doScroll, 3000);
      } else {
        // For streaming messages, double RAF is sufficient (#977)
        requestAnimationFrame(() => {
          requestAnimationFrame(doScroll);
        });
      }
    }
  }, [messages]);

  // Hide scroll button handler
  const hideScrollButton = useCallback(() => {
    userScrolledRef.current = false;
    setShowScrollButton(false);
  }, []);

  return {
    virtuosoRef,
    handleScroll,
    handleAtBottomStateChange,
    handleFollowOutput,
    showScrollButton,
    scrollToBottom,
    hideScrollButton,
  };
}
