const ORDINAL_WORDS = 'first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth';
const NUMBER_WORDS = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve';

// A spoken "this is a new transaction" marker: "next", "next item", "next one",
// "first item", "2nd item", "item 2", "item two". "next" followed by a word that
// makes it ordinary English ("next to the shop") is not a marker.
const MARKER = String.raw`(?:next(?!\s+(?:to|door|day|week|month|year|time)\b)(?:\s+(?:item|one))?|(?:${ORDINAL_WORDS}|\d+(?:st|nd|rd|th))\s+item|item\s+(?:\d+|${NUMBER_WORDS}))`;

const LEADING_MARKERS = new RegExp(String.raw`^(?:${MARKER}[\s,.:;-]*)+`, 'i');
const TRAILING_MARKERS = new RegExp(String.raw`[\s,.:;-]*(?:${MARKER})[\s,.:;-]*$`, 'i');
// Unambiguous multi-word markers that may still sit in the middle of a line.
const INLINE_MARKERS = new RegExp(String.raw`[\s,.;]*\b(?:next\s+(?:item|one)|(?:${ORDINAL_WORDS}|\d+(?:st|nd|rd|th))\s+item|item\s+(?:\d+|${NUMBER_WORDS}))\b[\s,.:;-]*`, 'gi');
const LIST_PREFIX = /^\s*(?:\d+[.)]|[-*•])\s*/;

// A transaction has exactly one date, so a second date word in the same line
// ("yesterday ... and today ...") means the speaker moved on to a new one. A time
// said right before the date word ("10pm today") travels with it.
const DATE_WORD = String.raw`(?:day\s+before\s+yesterday|yesterday|today|last\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))`;
const DATE_SWITCH = new RegExp(String.raw`(?:\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\s+)?\b${DATE_WORD}\b`, 'gi');
const CONNECTOR_END = /[\s,.;-]*\b(?:and|then|also|plus)\b[\s,.;-]*$/i;
const CONNECTOR_START = /^[\s,.;-]*(?:(?:and|then|also|plus)\b[\s,.;-]*)+/i;

function splitOnDateSwitch(line: string): string[] {
    const cuts: number[] = [];
    let seen = 0;
    for (const m of line.matchAll(DATE_SWITCH)) {
        seen += 1;
        if (seen > 1) cuts.push(m.index!);
    }
    if (cuts.length === 0) return [line];
    const pieces: string[] = [];
    let from = 0;
    for (const cut of [...cuts, line.length]) {
        pieces.push(line.slice(from, cut).replace(CONNECTOR_END, '').replace(CONNECTOR_START, ''));
        from = cut;
    }
    return pieces.filter((p) => p.trim());
}

// "10 pm", "10:30", "10 o'clock" are times, not amounts.
const TIME_EXPR = /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|o'?clock)(?!\w)|\b\d{1,2}:\d{2}\b/gi;
const hasAmount = (line: string) => /\d/.test(line.replace(TIME_EXPR, ' '));

/**
 * Safety net applied to the model's transcript: one clean transaction per
 * entry, with list numbering and any leftover spoken markers removed.
 *
 * A line with no amount ("soap chapati", "yesterday 10 pm items soap") is the
 * tail of the previous transaction that the model split by mistake, so it is
 * joined back — unless the speaker explicitly said a marker right before it.
 */
export function cleanTranscriptLines(text: string): string[] {
    const entries: { text: string; forced: boolean }[] = [];
    for (const rawLine of text.split(/\r?\n/)) {
        const pieces = rawLine.split(INLINE_MARKERS);
        pieces.forEach((piece, idx) => {
            const stripped = piece.replace(LIST_PREFIX, '');
            const forced = idx > 0 || LEADING_MARKERS.test(stripped);
            const line = stripped
                .replace(LEADING_MARKERS, '')
                .replace(TRAILING_MARKERS, '')
                .replace(/\s+/g, ' ')
                .trim();
            if (!line) return;
            const parts = splitOnDateSwitch(line);
            // Pieces split off by a date switch are real, separate transactions —
            // even a piece with no amount yet must not be glued back on.
            parts.forEach((part) => entries.push({ text: part.trim(), forced: forced || parts.length > 1 }));
        });
    }

    // Two neighbouring lines that each name their own day are two transactions,
    // whatever their amounts.
    const hasDate = (line: string) => new RegExp(DATE_SWITCH.source, 'i').test(line);
    for (let i = 1; i < entries.length; i++) {
        if (hasDate(entries[i].text) && hasDate(entries[i - 1].text)) {
            entries[i].forced = true;
            entries[i - 1].forced = true;
        }
    }

    const merged: { text: string; forced: boolean }[] = [];
    let carry = ''; // amountless words seen before any transaction
    for (const entry of entries) {
        const last = merged[merged.length - 1];
        if (!entry.forced && !hasAmount(entry.text)) {
            if (last) last.text += ` ${entry.text}`;
            else carry = carry ? `${carry} ${entry.text}` : entry.text;
            continue;
        }
        merged.push({ text: carry ? `${carry} ${entry.text}` : entry.text, forced: entry.forced });
        carry = '';
    }
    if (carry) merged.push({ text: carry, forced: true });
    return merged.map((e) => e.text);
}
