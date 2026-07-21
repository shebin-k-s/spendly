export function getISTDateString(): string {
    return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' });
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Builds an exact reference of relative date phrases → ISO dates, so the AI can
 * look up "last Monday" / "yesterday" instead of doing unreliable date arithmetic.
 */
export function getRelativeDateHints() {
    const { dateString } = getISTParts();
    const [y, m, d] = dateString.split('-').map(Number);
    // Anchor at noon UTC to avoid any timezone/DST drift when adding days.
    const today = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const dow = today.getUTCDay();

    const iso = (dt: Date) => dt.toISOString().slice(0, 10);
    const addDays = (n: number) => {
        const c = new Date(today);
        c.setUTCDate(c.getUTCDate() + n);
        return c;
    };

    const lastByWeekday = WEEKDAYS.map((name, i) => {
        let back = (dow - i + 7) % 7;
        if (back === 0) back = 7; // "last <today's weekday>" = a week ago
        return `last ${name} = ${iso(addDays(-back))}`;
    });

    return {
        todayName: WEEKDAYS[dow],
        todayDate: dateString,
        yesterday: iso(addDays(-1)),
        dayBeforeYesterday: iso(addDays(-2)),
        lastByWeekday,
    };
}

export function getISTParts() {
    const str = getISTDateString(); // Format: "2026-05-20 12:09:09"
    const [datePart, timePart] = str.split(' ');
    const [yearStr, monthStr, dayStr] = datePart.split('-');
    const [hourStr, minuteStr] = timePart.split(':');
    
    return {
        year: parseInt(yearStr, 10),
        month: parseInt(monthStr, 10),
        day: parseInt(dayStr, 10),
        hour: parseInt(hourStr, 10),
        minute: parseInt(minuteStr, 10),
        dateString: datePart, // "yyyy-MM-dd"
        timeString: `${hourStr}:${minuteStr}` // "HH:mm"
    };
}
