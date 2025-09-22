/**
 * Get current ISO week number and year
 */
export function getCurrentWeek(): { weekNumber: number; year: number } {
  const date = new Date();

  // Get Thursday of current week (ISO week date definition)
  const thursday = new Date(date.getTime());
  thursday.setDate(date.getDate() + (4 - (date.getDay() || 7)));

  const year = thursday.getFullYear();

  // Get first Thursday of the year
  const firstThursday = new Date(year, 0, 4);
  firstThursday.setDate(firstThursday.getDate() + (4 - (firstThursday.getDay() || 7)));

  // Calculate week number
  const weekNumber = Math.ceil(((thursday.getTime() - firstThursday.getTime()) / 86400000 + 1) / 7);

  return { weekNumber, year };
}

/**
 * Get week number for a specific date
 */
export function getWeekNumber(date: Date): { weekNumber: number; year: number } {
  // Get Thursday of current week (ISO week date definition)
  const thursday = new Date(date.getTime());
  thursday.setDate(date.getDate() + (4 - (date.getDay() || 7)));

  const year = thursday.getFullYear();

  // Get first Thursday of the year
  const firstThursday = new Date(year, 0, 4);
  firstThursday.setDate(firstThursday.getDate() + (4 - (firstThursday.getDay() || 7)));

  // Calculate week number
  const weekNumber = Math.ceil(((thursday.getTime() - firstThursday.getTime()) / 86400000 + 1) / 7);

  return { weekNumber, year };
}

/**
 * Get date range for a specific week
 */
export function getWeekDateRange(weekNumber: number, year: number): { startDate: Date; endDate: Date } {
  // Get first Thursday of the year
  const firstThursday = new Date(year, 0, 4);
  firstThursday.setDate(firstThursday.getDate() + (4 - (firstThursday.getDay() || 7)));

  // Calculate the Thursday of the target week
  const targetThursday = new Date(firstThursday.getTime() + (weekNumber - 1) * 7 * 24 * 60 * 60 * 1000);

  // Get Monday (start of week)
  const startDate = new Date(targetThursday.getTime());
  startDate.setDate(targetThursday.getDate() - 3);
  startDate.setHours(0, 0, 0, 0);

  // Get Sunday (end of week)
  const endDate = new Date(targetThursday.getTime());
  endDate.setDate(targetThursday.getDate() + 3);
  endDate.setHours(23, 59, 59, 999);

  return { startDate, endDate };
}
