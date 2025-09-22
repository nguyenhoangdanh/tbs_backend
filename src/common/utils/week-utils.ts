import { startOfWeek, endOfWeek, format as dateFnsFormat, getWeek, getYear, addDays } from 'date-fns';
import { vi } from 'date-fns/locale';

/**
 * Week-related utility functions
 */

/**
 * Get the current week number and year
 * Uses ISO week date system where Monday is the first day of the week
 */
export function getCurrentWeek(): { weekNumber: number; year: number } {
  const now = new Date();
  
  // Always use current calendar week
  const weekNumber = getWeek(now, { 
    weekStartsOn: 1, // Monday = 1
    firstWeekContainsDate: 4 
  });
  const year = getYear(now);

  return { weekNumber, year };
}

/**
 * Get week number and year from a specific date
 * @param date The date to get week info from
 */
export function getWeekFromDate(date: Date): { weekNumber: number; year: number } {
  // Create a copy to avoid modifying the original date
  const targetDate = new Date(date.getTime());
  
  // Set to nearest Thursday (defines the year for ISO week)
  const dayOfWeek = (targetDate.getDay() + 6) % 7; // Convert Sunday=0 to Monday=0
  targetDate.setDate(targetDate.getDate() - dayOfWeek + 3);
  
  // Get first Thursday of the year (week 1)
  const firstThursday = new Date(targetDate.getFullYear(), 0, 4);
  const firstThursdayDayOfWeek = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstThursdayDayOfWeek + 3);
  
  // Calculate week number
  const weekNumber = Math.floor((targetDate.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  
  return {
    weekNumber: Math.max(1, Math.min(53, weekNumber)),
    year: targetDate.getFullYear()
  };
}

/**
 * Get the date range for a specific week
 * @param weekNumber Week number (1-53)
 * @param year Year
 */
export function getWeekDateRange(weekNumber: number, year: number): { startDate: Date; endDate: Date } {
  // Get first Thursday of the year (defines week 1)
  const firstThursday = new Date(year, 0, 4);
  const firstThursdayDayOfWeek = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstThursdayDayOfWeek + 3);
  
  // Calculate the Thursday of the target week
  const targetThursday = new Date(firstThursday.getTime());
  targetThursday.setDate(targetThursday.getDate() + (weekNumber - 1) * 7);
  
  // Get Monday (start of week)
  const startDate = new Date(targetThursday.getTime());
  startDate.setDate(startDate.getDate() - 3);
  
  // Get Sunday (end of week)
  const endDate = new Date(targetThursday.getTime());
  endDate.setDate(endDate.getDate() + 3);
  
  return { startDate, endDate };
}

/**
 * Calculate how many days overdue a report is
 * @param weekNumber The week number of the report
 * @param year The year of the report
 */
export function calculateDaysOverdue(weekNumber: number, year: number): number {
  const now = new Date();
  const { endDate } = getWeekDateRange(weekNumber, year);
  
  // Add grace period (e.g., reports due by end of Sunday + 1 day grace)
  const dueDate = new Date(endDate.getTime());
  dueDate.setDate(dueDate.getDate() + 1); // 1 day grace period
  dueDate.setHours(23, 59, 59, 999); // End of grace day
  
  if (now <= dueDate) {
    return 0; // Not overdue
  }
  
  const diffTime = now.getTime() - dueDate.getTime();
  const diffDays = Math.ceil(diffTime / (24 * 60 * 60 * 1000));
  
  return diffDays;
}

/**
 * Get week info string for display
 * @param weekNumber Week number
 * @param year Year
 */
export function getWeekDisplayString(weekNumber: number, year: number): string {
  const { startDate, endDate } = getWeekDateRange(weekNumber, year);
  
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };
  
  return `Tuần ${weekNumber}/${year} (${formatDate(startDate)} - ${formatDate(endDate)})`;
}

/**
 * Check if a specific date falls within a given week
 * @param date Date to check
 * @param weekNumber Week number
 * @param year Year
 */
export function isDateInWeek(date: Date, weekNumber: number, year: number): boolean {
  const { startDate, endDate } = getWeekDateRange(weekNumber, year);
  
  // Set time to start/end of day for proper comparison
  const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const weekEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  
  return checkDate >= weekStart && checkDate <= weekEnd;
}

/**
 * Get all dates within a specific week
 * @param weekNumber Week number
 * @param year Year
 */
export function getWeekDates(weekNumber: number, year: number): Date[] {
  const { startDate } = getWeekDateRange(weekNumber, year);
  const dates: Date[] = [];
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate.getTime());
    date.setDate(date.getDate() + i);
    dates.push(date);
  }
  
  return dates;
}

/**
 * Get month(s) that a specific week spans across
 * @param weekNumber Week number
 * @param year Year
 */
export function getWeekMonths(weekNumber: number, year: number): Array<{ month: number; year: number }> {
  const { startDate, endDate } = getWeekDateRange(weekNumber, year);
  const months = new Set<string>();
  
  // Add start month
  months.add(`${startDate.getFullYear()}-${startDate.getMonth()}`);
  
  // Add end month if different
  months.add(`${endDate.getFullYear()}-${endDate.getMonth()}`);
  
  return Array.from(months).map(monthStr => {
    const [yearStr, monthStr2] = monthStr.split('-');
    return {
      year: parseInt(yearStr),
      month: parseInt(monthStr2) + 1 // Convert to 1-12 range
    };
  });
}

/**
 * Check if a week spans across multiple months
 * @param weekNumber Week number
 * @param year Year
 */
export function isWeekCrossMonth(weekNumber: number, year: number): boolean {
  const months = getWeekMonths(weekNumber, year);
  return months.length > 1;
}

/**
 * Get previous week
 * @param weekNumber Current week number
 * @param year Current year
 */
export function getPreviousWeek(weekNumber: number, year: number): { weekNumber: number; year: number } {
  if (weekNumber > 1) {
    return { weekNumber: weekNumber - 1, year };
  } else {
    // Go to last week of previous year
    return { weekNumber: 52, year: year - 1 }; // Simplified, actual last week might be 53
  }
}

/**
 * Get next week
 * @param weekNumber Current week number
 * @param year Current year
 */
export function getNextWeek(weekNumber: number, year: number): { weekNumber: number; year: number } {
  if (weekNumber < 52) {
    return { weekNumber: weekNumber + 1, year };
  } else {
    // Check if week 53 exists for this year
    const week53Date = new Date(year, 11, 31); // Dec 31
    const week53Info = getWeekFromDate(week53Date);
    
    if (week53Info.weekNumber === 53 && week53Info.year === year && weekNumber < 53) {
      return { weekNumber: weekNumber + 1, year };
    } else {
      // Go to first week of next year
      return { weekNumber: 1, year: year + 1 };
    }
  }
}

/**
 * Get current work week (Friday to Thursday cycle)
 * Work week được tính theo logic thực tế:
 * - Work week N = T6,T7 của ISO week (N-1) + T2,T3,T4,T5 của ISO week N
 * - Ví dụ: Work week 28 = T6,T7 của ISO week 27 + T2,T3,T4,T5 của ISO week 28
 * 
 * Logic xác định:
 * - Nếu hôm nay là T6,T7 của ISO week X → thuộc work week (X+1)
 * - Nếu hôm nay là T2,T3,T4,T5 của ISO week Y → thuộc work week Y  
 * - Nếu hôm nay là CN → thuộc work week của tuần trước (vì CN không làm việc)
 */
export function getCurrentWorkWeek(): { weekNumber: number; year: number } {
  const now = new Date();
  return getWorkWeekFromDate(now);
}

/**
 * Get work week number and year from a specific date
 * Logic chính xác:
 * - T6, T7: thuộc work week = ISO week + 1
 * - T2, T3, T4, T5: thuộc work week = ISO week hiện tại
 * - CN: thuộc work week = ISO week hiện tại (vì CN không làm việc, follow T2-T5)
 */
export function getWorkWeekFromDate(date: Date): { weekNumber: number; year: number } {
  const targetDate = new Date(date.getTime());
  const dayOfWeek = targetDate.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  
  // Lấy ISO week của ngày hiện tại
  const isoWeekNumber = getWeek(targetDate, { 
    weekStartsOn: 1, // Monday = 1
    firstWeekContainsDate: 4 
  });
  const isoYear = getYear(targetDate);
  
  let workWeekNumber: number;
  let workYear: number;
  
  if (dayOfWeek === 5 || dayOfWeek === 6) {
    // Friday or Saturday (T6, T7) - thuộc work week tiếp theo
    workWeekNumber = isoWeekNumber + 1;
    workYear = isoYear;
    
    // Handle year transition
    if (workWeekNumber > 52) {
      // Check if week 53 exists
      const lastDayOfYear = new Date(isoYear, 11, 31);
      const lastWeekOfYear = getWeek(lastDayOfYear, { 
        weekStartsOn: 1, 
        firstWeekContainsDate: 4 
      });
      
      if (workWeekNumber > lastWeekOfYear) {
        workWeekNumber = 1;
        workYear = isoYear + 1;
      }
    }
  } else {
    // Monday to Thursday + Sunday - thuộc work week hiện tại
    workWeekNumber = isoWeekNumber;
    workYear = isoYear;
  }

  return { weekNumber: workWeekNumber, year: workYear };
}

/**
 * Get the date range for a specific work week (Friday-Thursday)
 * Work week N bao gồm:
 * - T6, T7 của ISO week (N-1) 
 * - T2, T3, T4, T5 của ISO week N
 */
export function getWorkWeekDateRange(weekNumber: number, year: number): { 
  startDate: Date; 
  endDate: Date; 
  workingDays: Date[];
  resultDays: Date[]; // Mon-Thu for result calculation
} {
  // Step 1: Tìm thứ 2 đầu tiên của năm
  const jan4 = new Date(year, 0, 4); // Ngày 4 tháng 1 luôn thuộc tuần 1
  const jan4DayOfWeek = (jan4.getDay() + 6) % 7; // Chuyển Sunday=0 thành Monday=0
  const firstMondayOfYear = new Date(jan4.getTime());
  firstMondayOfYear.setDate(jan4.getDate() - jan4DayOfWeek); // Lùi về thứ 2 của tuần 1
  
  // Step 2: Tính thứ 2 của ISO week N
  const mondayOfWeekN = new Date(firstMondayOfYear.getTime());
  mondayOfWeekN.setDate(firstMondayOfYear.getDate() + (weekNumber - 1) * 7);
  
  // Step 3: Tính các ngày làm việc cho work week N
  const workingDays: Date[] = [];
  
  // T6 của tuần ISO (N-1) = T6 trước thứ 2 của tuần N
  const friday = new Date(mondayOfWeekN.getTime());
  friday.setDate(mondayOfWeekN.getDate() - 3); // Thứ 2 - 3 = Thứ 6 tuần trước
  workingDays.push(friday);
  
  // T7 của tuần ISO (N-1) = T7 trước thứ 2 của tuần N
  const saturday = new Date(mondayOfWeekN.getTime());
  saturday.setDate(mondayOfWeekN.getDate() - 2); // Thứ 2 - 2 = Thứ 7 tuần trước
  workingDays.push(saturday);
  
  // T2, T3, T4, T5 của tuần ISO N
  for (let i = 0; i < 4; i++) {
    const day = new Date(mondayOfWeekN.getTime());
    day.setDate(mondayOfWeekN.getDate() + i); // Thứ 2, 3, 4, 5
    workingDays.push(day);
  }
  
  // Result calculation days: Monday to Thursday only (4 ngày chính của tuần)
  const resultDays = workingDays.slice(2); // Skip Friday and Saturday
  
  const startDate = friday; // Work week bắt đầu từ T6
  const endDate = workingDays[5]; // Work week kết thúc ở T5 (index 5)
  
  return { 
    startDate,
    endDate,
    workingDays,
    resultDays
  };
}

/**
 * Get current reporting period (Monday-Thursday of current work week)
 * This is used for result calculation during the week
 */
export function getCurrentReportingPeriod(): { 
  startDate: Date; 
  endDate: Date; 
  workWeek: { weekNumber: number; year: number };
  isInReportingPeriod: boolean;
} {
  const workWeek = getCurrentWorkWeek();
  const { resultDays } = getWorkWeekDateRange(workWeek.weekNumber, workWeek.year);
  
  // Reporting period is Monday-Thursday of the work week
  const startDate = resultDays[0]; // Monday
  const endDate = resultDays[3]; // Thursday
  
  // Check if today is in reporting period
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  const isInReportingPeriod = dayOfWeek >= 1 && dayOfWeek <= 4; // Monday to Thursday
  
  return {
    startDate,
    endDate,
    workWeek,
    isInReportingPeriod
  };
}

/**
 * Check if current time is in reporting period (Monday-Thursday)
 */
export function isInReportingPeriod(): boolean {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  
  // Reporting period is Monday(1) to Thursday(4)
  return dayOfWeek >= 1 && dayOfWeek <= 4;
}

/**
 * Format work week for display with date range
 * @param weekNumber Work week number
 * @param year Year
 * @param format Format type
 */
export function formatWorkWeek(
  weekNumber: number, 
  year: number, 
  formatType: 'short' | 'long' | 'range' | 'full' = 'short'
): string {
  switch (formatType) {
    case 'short':
      return `Tuần ${weekNumber}/${year}`;
    case 'long':
      return `Tuần làm việc ${weekNumber} năm ${year}`;
    case 'range': {
      const { startDate, endDate } = getWorkWeekDateRange(weekNumber, year);
      return `${dateFnsFormat(startDate, 'dd/MM', { locale: vi })} - ${dateFnsFormat(endDate, 'dd/MM/yyyy', { locale: vi })}`;
    }
    case 'full': {
      const { startDate, endDate } = getWorkWeekDateRange(weekNumber, year);
      return `Tuần ${weekNumber}/${year} (${dateFnsFormat(startDate, 'dd/MM', { locale: vi })} - ${dateFnsFormat(endDate, 'dd/MM/yyyy', { locale: vi })})`;
    }
    default:
      return `Tuần ${weekNumber}/${year}`;
  }
}

/**
 * Get work week display info with detailed breakdown
 */
export function getWorkWeekDisplayInfo(weekNumber: number, year: number): {
  weekTitle: string;
  dateRange: string;
  workingDays: string[];
  resultDays: string[];
  fullTitle: string;
} {
  const { startDate, endDate, workingDays, resultDays } = getWorkWeekDateRange(weekNumber, year);
  
  const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  
  return {
    weekTitle: `Tuần ${weekNumber}/${year}`,
    dateRange: `${dateFnsFormat(startDate, 'dd/MM', { locale: vi })} - ${dateFnsFormat(endDate, 'dd/MM/yyyy', { locale: vi })}`,
    workingDays: workingDays.map(date => 
      `${dayNames[date.getDay()]} ${dateFnsFormat(date, 'dd/MM', { locale: vi })}`
    ),
    resultDays: resultDays.map(date => 
      `${dayNames[date.getDay()]} ${dateFnsFormat(date, 'dd/MM', { locale: vi })}`
    ),
    fullTitle: `Tuần ${weekNumber}/${year} (${dateFnsFormat(startDate, 'dd/MM', { locale: vi })} - ${dateFnsFormat(endDate, 'dd/MM/yyyy', { locale: vi })})`
  };
}

/**
 * Check if a week is valid for report creation
 * Logic: Allow creation for current week, previous week, and next week
 */
export function isValidWeekForCreation(
  weekNumber: number,
  year: number,
  currentWeek: number,
  currentYear: number,
): boolean {
  // Current week
  if (weekNumber === currentWeek && year === currentYear) {
    return true;
  }
  
  // Previous week
  if (isPreviousWeek(weekNumber, year, currentWeek, currentYear)) {
    return true;
  }
  
  // Next week
  if (isNextWeek(weekNumber, year, currentWeek, currentYear)) {
    return true;
  }
  
  return false;
}

/**
 * Check if a week is valid for report editing
 * Logic: Allow editing for current week, previous week, and next week
 */
export function isValidWeekForEdit(
  weekNumber: number,
  year: number,
  currentWeek: number,
  currentYear: number,
): boolean {
  return isValidWeekForCreation(weekNumber, year, currentWeek, currentYear);
}

/**
 * Check if a week is valid for report deletion
 * Logic: Allow deletion for current week and next week only
 */
export function isValidWeekForDeletion(
  weekNumber: number,
  year: number,
  currentWeek: number,
  currentYear: number,
): boolean {
  // Current week
  if (weekNumber === currentWeek && year === currentYear) {
    return true;
  }
  
  // Next week
  if (isNextWeek(weekNumber, year, currentWeek, currentYear)) {
    return true;
  }
  
  return false;
}

/**
 * Helper: Check if target week is previous week
 */
function isPreviousWeek(
  weekNumber: number,
  year: number,
  currentWeek: number,
  currentYear: number,
): boolean {
  if (year === currentYear) {
    return weekNumber === currentWeek - 1;
  }
  
  // Handle year transition (current week 1, target week 52/53 of previous year)
  if (year === currentYear - 1 && currentWeek === 1) {
    return weekNumber >= 52;
  }
  
  return false;
}

/**
 * Helper: Check if target week is next week
 */
function isNextWeek(
  weekNumber: number,
  year: number,
  currentWeek: number,
  currentYear: number,
): boolean {
  if (year === currentYear) {
    return weekNumber === currentWeek + 1;
  }
  
  // Handle year transition (current week 52/53, target week 1 of next year)
  if (year === currentYear + 1 && currentWeek >= 52) {
    return weekNumber === 1;
  }
  
  return false;
}

/**
 * Get previous work week (for auto-locking reports)
 * @param weekNumber Current work week number
 * @param year Current year
 */
export function getPreviousWorkWeek(weekNumber: number, year: number): { weekNumber: number; year: number } {
  if (weekNumber > 1) {
    return { weekNumber: weekNumber - 1, year };
  } else {
    // Xử lý chuyển năm: lấy tuần làm việc cuối cùng của năm trước
    const lastDayPrevYear = new Date(year - 1, 11, 31);
    const lastWorkWeek = getWorkWeekFromDate(lastDayPrevYear);
    return { weekNumber: lastWorkWeek.weekNumber, year: lastWorkWeek.year };
  }
}