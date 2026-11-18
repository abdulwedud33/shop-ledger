/** Date ranges cut in the shop's timezone. No libraries; uses Intl only. Ranges are [from, to). */
export type Period = 'today' | 'week' | 'month';

interface Parts { y: number; m: number; d: number; h: number; mi: number; s: number; wd: number }

function partsIn(timeZone: string, instant: number): Parts {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short',
  });
  const get = (t: string) => f.formatToParts(new Date(instant)).find((p) => p.type === t)?.value ?? '0';
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { y: +get('year'), m: +get('month'), d: +get('day'), h: +get('hour') % 24, mi: +get('minute'), s: +get('second'), wd };
}

/** Offset (ms) of the timezone from UTC at a given instant. */
export function tzOffsetMs(timeZone: string, instant: number): number {
  const p = partsIn(timeZone, instant);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(instant / 1000) * 1000;
}

/** The UTC instant at which local midnight of (y, m, d) happens in the timezone. */
function localMidnight(timeZone: string, y: number, m: number, d: number): number {
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - tzOffsetMs(timeZone, guess);
  t = guess - tzOffsetMs(timeZone, t); // second pass handles DST edges
  return t;
}

export function rangeFor(period: Period, timeZone: string, now: number = Date.now()): { from: string; to: string } {
  const p = partsIn(timeZone, now);
  let startY = p.y, startM = p.m, startD = p.d;
  let endY: number, endM: number, endD: number;
  if (period === 'today') {
    const next = new Date(Date.UTC(p.y, p.m - 1, p.d + 1));
    [endY, endM, endD] = [next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()];
  } else if (period === 'week') {
    const back = (p.wd + 6) % 7; // week starts Monday
    const s = new Date(Date.UTC(p.y, p.m - 1, p.d - back));
    [startY, startM, startD] = [s.getUTCFullYear(), s.getUTCMonth() + 1, s.getUTCDate()];
    const e = new Date(Date.UTC(startY, startM - 1, startD + 7));
    [endY, endM, endD] = [e.getUTCFullYear(), e.getUTCMonth() + 1, e.getUTCDate()];
  } else {
    startD = 1;
    const e = new Date(Date.UTC(p.y, p.m, 1));
    [endY, endM, endD] = [e.getUTCFullYear(), e.getUTCMonth() + 1, 1];
  }
  return {
    from: new Date(localMidnight(timeZone, startY, startM, startD)).toISOString(),
    to: new Date(localMidnight(timeZone, endY, endM, endD)).toISOString(),
  };
}
