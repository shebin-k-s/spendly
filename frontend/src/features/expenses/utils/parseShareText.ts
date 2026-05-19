interface ParsedShare {
  amount: string;
  description: string;
  paymentMethod: 'upi' | 'card' | 'cash' | 'bank_transfer' | 'other';
}

export function parseShareText(raw: string): ParsedShare {
  const text = raw.trim();

  // --- Amount ---
  // Handles: ₹250, Rs.250, Rs 250, INR 250, INR1,200.50
  const amountMatch = text.match(
    /(?:₹|Rs\.?\s*|INR\s*)([\d,]+(?:\.\d{1,2})?)/i
  );
  const amount = amountMatch ? amountMatch[1].replace(/,/g, '') : '';

  // --- Description (merchant name) ---
  // Try patterns in priority order
  let description = '';

  const patterns = [
    /paid\s+to\s+([A-Za-z][^.!\n@]{2,40})/i,        // "paid to Zomato"
    /sent\s+to\s+([A-Za-z][^.!\n@]{2,40})/i,          // "sent to Swiggy"
    /debited.*?to\s+([A-Za-z][^.!\n@]{2,40})/i,       // "debited to Amazon"
    /transferred\s+to\s+([A-Za-z][^.!\n@]{2,40})/i,   // "transferred to Flipkart"
    /payment\s+to\s+([A-Za-z][^.!\n@]{2,40})/i,       // "payment to BigBasket"
    /at\s+([A-Za-z][^.!\n@]{2,40})/i,                  // "at Starbucks"
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      description = match[1].trim();
      // Drop anything after common stop words that indicate end of merchant name
      description = description.split(/\s+(?:via|on|ref|txn|transaction|using|from|for)\b/i)[0].trim();
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

  return { amount, description, paymentMethod };
}
