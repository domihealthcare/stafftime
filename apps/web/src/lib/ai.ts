import { useEffect, useState } from 'react';
import { api } from './api';

/**
 * Whether the AI helpers are switched on — Ask Domi Staff and the writing
 * help on News, the calendar and time off (October 2026). The server says
 * so in `/config` once an Anthropic key is set; until it has answered, and
 * whenever it cannot, they are treated as off and their buttons stay hidden.
 */
export function useAiOn(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    api
      .appConfig()
      .then((config) => {
        if (live) setOn(Boolean(config.assistant));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return on;
}

/// What every AI helper says under its button: what is sent, and that it is
/// a draft to read.
export const AI_NOTE =
  'Written by Claude, an AI service run by Anthropic, from what is typed here — read it through before using it. Never type patient details.';
