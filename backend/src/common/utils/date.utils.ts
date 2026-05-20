export function getISTDateString(): string {
    return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' });
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
