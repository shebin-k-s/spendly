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

/**
 * Safety net applied to the model's transcript: one clean transaction per
 * entry, with list numbering and any leftover spoken markers removed.
 */
export function cleanTranscriptLines(text: string): string[] {
    const lines: string[] = [];
    for (const rawLine of text.split(/\r?\n/)) {
        for (const piece of rawLine.split(INLINE_MARKERS)) {
            const line = piece
                .replace(LIST_PREFIX, '')
                .replace(LEADING_MARKERS, '')
                .replace(TRAILING_MARKERS, '')
                .replace(/\s+/g, ' ')
                .trim();
            if (line) lines.push(line);
        }
    }
    return lines;
}
