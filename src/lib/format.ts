// Formats a "HH:MM" or "HH:MM:SS" time string (as stored/from <input type="time">)
// into a 12-hour "h:mm AM/PM" display string.
export function formatTime12(time: string | null | undefined): string {
  if (!time) return '';
  const [hStr, mStr] = time.split(':');
  const h24 = parseInt(hStr, 10);
  if (Number.isNaN(h24)) return '';
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  return `${h12}:${mStr} ${period}`;
}
