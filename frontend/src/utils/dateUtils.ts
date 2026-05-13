/**
 * Formats a date string to DD-MM-YYYY
 * @param dateStr Date string (usually YYYY-MM-DD from backend)
 * @returns Formatted date string
 */
export const formatDate = (dateStr: string | undefined | null): string => {
  if (!dateStr) return "N/A";
  
  // If it's already in DD-MM-YYYY (has hyphens and first part is length 2)
  const parts = dateStr.split("-");
  if (parts.length === 3 && parts[0].length === 2) {
    return dateStr;
  }

  // If it's YYYY-MM-DD
  if (parts.length === 3 && parts[0].length === 4) {
    const [y, m, d] = parts;
    return `${d}-${m}-${y}`;
  }

  // Fallback for ISO strings or other formats
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  } catch {
    return dateStr;
  }
};
