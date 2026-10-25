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

// "night", "10pm", "night 10pm" said right after a date word belong to it.
const TRAILING_TIME = /^(?:\s+(?:night|morning|evening|afternoon))?(?:\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)(?!\w))?/i;

// Where the date sits inside a transaction is the speaker's choice — "yesterday
// 10pm tea 20", "tea 20 yesterday 10pm" — so the amounts decide where one
// transaction stops and the next begins:
//  - "tea 20 today and auto 30 yesterday": the first amount already came before
//    its date and nothing (or just a connector) follows the next date → the date closes its transaction,
//    so cut right after it.
//  - everything else (date first, or amounts after the dates) → the date opens
//    its transaction, so cut right before the next date.
function splitOnDateSwitch(line: string): string[] {
    const matches = [...line.matchAll(DATE_SWITCH)];
    if (matches.length < 2) return [line];

    const cuts: number[] = [];
    let segStart = 0;
    const dayKey = (m: RegExpMatchArray) => (m[0].match(new RegExp(DATE_WORD, 'i'))?.[0] ?? '').toLowerCase().replace(/\s+/g, ' ');
    for (let i = 0; i < matches.length - 1; i++) {
        const cur = matches[i];
        const next = matches[i + 1];
        if (cur.index! < segStart) continue; // already used up as the tail of the previous transaction
        const curEnd = cur.index! + cur[0].length;
        const nextStart = next.index!;
        const nextEnd = nextStart + next[0].length;
        const after = matches[i + 2]?.index ?? line.length;

        const trailingStyle =
            hasAmount(line.slice(segStart, cur.index!)) &&
            hasAmount(line.slice(curEnd, nextStart)) &&
            (!hasAmount(line.slice(nextEnd, after)) || /^\s*(?:and|then|also|plus)\b/i.test(line.slice(nextEnd, after)));

        // "yesterday 23rs tiffen yesterday 9pm and then 250rs …": the same day said again, with just a time and then a
        // connector, is the tail of the transaction before it — not the start of a new one.
        const nextTimeLen = line.slice(nextEnd).match(TRAILING_TIME)?.[0].length ?? 0;
        const sameDayTail =
            dayKey(cur) === dayKey(next) &&
            hasAmount(line.slice(curEnd, nextStart)) &&
            !hasAmount(line.slice(nextEnd, nextEnd + nextTimeLen)) &&
            /^\s*(?:and|then|also|plus)\b/i.test(line.slice(nextEnd + nextTimeLen));

        let cut = nextStart;
        if (sameDayTail) {
            cut = nextEnd + nextTimeLen;
        } else if (trailingStyle) {
            cut = Math.min(curEnd + (line.slice(curEnd).match(TRAILING_TIME)?.[0].length ?? 0), nextStart);
        }
        cuts.push(cut);
        segStart = cut;
    }

    const pieces: string[] = [];
    let from = 0;
    for (const cut of [...cuts, line.length]) {
        pieces.push(line.slice(from, cut).replace(CONNECTOR_END, '').replace(CONNECTOR_START, ''));
        from = cut;
    }
    return pieces.filter((p) => p.trim());
}

// "rs 20", "Rs. 150", "₹45", "50 rupees", "20 rs" → "20rs" / "150rs" / "45rs" / "50rs" / "20rs".
const CURRENCY_BEFORE = /(?:\brs\.?|\brupees?\b|\binr\b|₹)\s*(\d+(?:\.\d+)?)/gi;
const CURRENCY_AFTER = /(\d+(?:\.\d+)?)\s*(?:rs\b\.?|rupees?\b|inr\b|₹)/gi;
export function normalizeCurrency(line: string): string {
    return line.replace(CURRENCY_BEFORE, '$1rs').replace(CURRENCY_AFTER, '$1rs');
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
    // `marker`: the speaker explicitly said "next / second item" before it, so it stays separate whatever it holds.
    const entries: { text: string; forced: boolean; marker: boolean }[] = [];
    for (const rawLine of text.split(/\r?\n/)) {
        const pieces = rawLine.split(INLINE_MARKERS);
        pieces.forEach((piece, idx) => {
            const stripped = piece.replace(LIST_PREFIX, '');
            const forced = idx > 0 || LEADING_MARKERS.test(stripped);
            const line = normalizeCurrency(stripped
                .replace(LEADING_MARKERS, '')
                .replace(TRAILING_MARKERS, '')
                .replace(CONNECTOR_START, '') // "and then 250rs for…" — a spoken connector, not part of the line
                .replace(CONNECTOR_END, '')
                .replace(/\s+/g, ' ')
                .trim());
            if (!line) return;
            const parts = splitOnDateSwitch(line);
            // Pieces split off by a date switch are real, separate transactions —
            // even a piece with no amount yet must not be glued back on.
            parts.forEach((part) => entries.push({ text: part.trim(), forced: forced || parts.length > 1, marker: forced }));
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

    // The same day said twice ("yesterday 23rs tiffen … yesterday 9pm") is ONE transaction: an amountless piece that
    // names the same day as the line before it is that line's tail, not a new transaction.
    const dayOf = (line: string) => line.match(new RegExp(DATE_WORD, 'i'))?.[0].toLowerCase().replace(/\s+/g, ' ') ?? null;
    const merged: { text: string; forced: boolean }[] = [];
    let carry = ''; // amountless words seen before any transaction
    for (const entry of entries) {
        const last = merged[merged.length - 1];
        const sameDayTail = !entry.marker && !!last && dayOf(entry.text) !== null && dayOf(entry.text) === dayOf(last.text);
        if ((!entry.forced || sameDayTail) && !hasAmount(entry.text)) {
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

/**
 * True when a 16-bit PCM WAV (what the app uploads) is effectively silent — a
 * speech model asked to transcribe silence tends to invent plausible words, so
 * such recordings are rejected before they reach it. Anything that isn't a
 * readable PCM16 WAV is let through unchanged.
 */
export function wavLooksSilent(buf: Buffer, rmsThreshold = 0.008): boolean {
    if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return false;
    let offset = 12;
    while (offset + 8 <= buf.length) {
        const id = buf.toString('ascii', offset, offset + 4);
        const size = buf.readUInt32LE(offset + 4);
        if (id === 'data') {
            const end = Math.min(buf.length, offset + 8 + size);
            let sum = 0;
            let n = 0;
            for (let i = offset + 8; i + 1 < end; i += 2) {
                const v = buf.readInt16LE(i) / 32768;
                sum += v * v;
                n++;
            }
            return n === 0 || Math.sqrt(sum / n) < rmsThreshold;
        }
        offset += 8 + size + (size % 2);
    }
    return false;
}

// ---- Spoken changes to a list that is already on screen ----------------------------------------------------

/** One thing the speaker asked for, as understood by the model (line numbers are 1-based, as shown on screen). */
export interface VoiceOp {
    op: 'append' | 'edit' | 'remove' | 'skip';
    line?: number;
    text?: string;
    reason?: string;
}

export interface VoiceChanges {
    edited: number[];
    removed: number[];
    added: number;
    skipped: string[]; // things that could not be done, in words the user can read
}

const stripListPrefix = (t: string) => t.replace(LIST_PREFIX, '').replace(/\s+/g, ' ').trim();

/**
 * Applies the model's ops to the current list in plain code, so a line the speaker did not mention can never
 * be touched, and an impossible request (a line that does not exist) is skipped, not guessed.
 */
export function applyVoiceOps(current: string[], ops: VoiceOp[]): { lines: string[]; changes: VoiceChanges } {
    const lines = [...current];
    const changes: VoiceChanges = { edited: [], removed: [], added: 0, skipped: [] };
    const removed = new Set<number>();
    const appended: string[] = [];
    const valid = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= current.length;

    for (const op of ops) {
        if (op.op === 'edit') {
            const text = typeof op.text === 'string' ? normalizeCurrency(stripListPrefix(op.text)) : '';
            if (!valid(op.line)) changes.skipped.push(`There is no item ${op.line ?? '?'} in the list`);
            else if (!text) changes.skipped.push(`Item ${op.line}: nothing to change it to`);
            // The model sometimes "edits" a line to what it already says (e.g. when it heard nothing): not a change.
            else if (text === current[op.line - 1].trim()) continue;
            else if (!changes.edited.includes(op.line)) { lines[op.line - 1] = text; changes.edited.push(op.line); }
        } else if (op.op === 'remove') {
            if (!valid(op.line)) changes.skipped.push(`There is no item ${op.line ?? '?'} to remove`);
            else removed.add(op.line);
        } else if (op.op === 'append') {
            if (typeof op.text === 'string' && op.text.trim()) appended.push(op.text);
        } else if (op.op === 'skip') {
            changes.skipped.push(op.reason?.trim() || "Couldn't tell which item to change");
        }
    }

    changes.removed = [...removed].sort((a, b) => a - b);
    changes.edited = changes.edited.filter((n) => !removed.has(n)).sort((a, b) => a - b);
    const added = cleanTranscriptLines(appended.join('\n'));
    changes.added = added.length;
    return { lines: [...lines.filter((_, i) => !removed.has(i + 1)), ...added], changes };
}
