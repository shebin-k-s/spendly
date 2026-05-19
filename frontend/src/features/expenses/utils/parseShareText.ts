import { parse, isValid, format } from 'date-fns';

interface ParsedShare {
  amount: string;
  description: string;
  paymentMethod: 'upi' | 'card' | 'cash' | 'bank_transfer' | 'other';
  date: string | null;   // yyyy-MM-dd or null if not found
  time: string | null;   // HH:mm or null if not found
}

// Try to parse a date string using multiple known formats
function tryParseDate(dateStr: string): Date | null {
  const formats = [
    'dd-MM-yyyy', 'dd/MM/yyyy', 'dd-MM-yy', 'dd/MM/yy',
    'dd MMM yyyy', 'dd MMM yy', 'MMM dd, yyyy', 'MMM dd yyyy',
    'd MMM yyyy', 'd-MM-yyyy', 'd/MM/yyyy',
  ];
  for (const fmt of formats) {
    const d = parse(dateStr.trim(), fmt, new Date());
    if (isValid(d)) return d;
  }
  return null;
}

// Try to parse a time string into 24h HH:mm
function tryParseTime(timeStr: string): string | null {
  // Already 24h: "14:30" or "14:30:05"
  const h24 = timeStr.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (h24) {
    const h = parseInt(h24[1]);
    const m = h24[2];
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, '0')}:${m}`;
  }
  // 12h: "2:30 PM" or "02:30PM"
  const h12 = timeStr.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)/i);
  if (h12) {
    let h = parseInt(h12[1]);
    const m = h12[2];
    const period = h12[3].toUpperCase();
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m}`;
  }
  return null;
}

export function parseShareText(raw: string): ParsedShare {
  const text = raw.trim();

  // --- Amount ---
  const amountMatch = text.match(/(?:₹|Rs\.?\s*|INR\s*)([\d,]+(?:\.\d{1,2})?)/i);
  const amount = amountMatch ? amountMatch[1].replace(/,/g, '') : '';

  // --- Description (merchant name) ---
  let description = '';
  const descPatterns = [
    /paid\s+to\s+([A-Za-z][^.!\n@]{2,40})/i,
    /sent\s+to\s+([A-Za-z][^.!\n@]{2,40})/i,
    /debited.*?to\s+([A-Za-z][^.!\n@]{2,40})/i,
    /transferred\s+to\s+([A-Za-z][^.!\n@]{2,40})/i,
    /payment\s+to\s+([A-Za-z][^.!\n@]{2,40})/i,
    /at\s+([A-Za-z][^.!\n@]{2,40})/i,
  ];
  for (const pattern of descPatterns) {
    const match = text.match(pattern);
    if (match) {
      description = match[1].trim()
        .split(/\s+(?:via|on|ref|txn|transaction|using|from|for)\b/i)[0]
        .trim();
      break;
    }
  }

  // --- Payment method ---
  let paymentMethod: ParsedShare['paymentMethod'] = 'upi';
  const lower = text.toLowerCase();
  if (/\b(upi|gpay|google pay|phonepe|paytm|bhim|razorpay|neft|imps|rtgs|bank transfer)\b/.test(lower)) {
    paymentMethod = 'upi';
  } else if (/\b(credit card|debit card|card)\b/.test(lower)) {
    paymentMethod = 'card';
  } else if (/\bcash\b/.test(lower)) {
    paymentMethod = 'cash';
  }

  // --- Date ---
  // Match patterns like: "19-05-2025", "19/05/25", "19 May 2025", "May 19, 2025"
  let date: string | null = null;
  const datePatterns = [
    /\b(\d{1,2}[-/]\d{2}[-/]\d{2,4})\b/,                          // 19-05-2025, 19/05/25
    /\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})\b/i, // 19 May 2025
    /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/i, // May 19, 2025
  ];
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      const parsed = tryParseDate(match[1]);
      if (parsed) {
        date = format(parsed, 'yyyy-MM-dd');
        break;
      }
    }
  }

  // --- Time ---
  // Match: "14:30", "14:30:05", "2:30 PM", "02:30PM"
  let time: string | null = null;
  const timeMatch = text.match(/\b(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\b/i);
  if (timeMatch) {
    time = tryParseTime(timeMatch[1]);
  }

  return { amount, description, paymentMethod, date, time };
}
