/**
 * Time serialization utilities for worksheet records
 * Handles conversion between DateTime objects and time-only strings for API responses
 */

/**
 * Convert DateTime object to time-only string in HH:MM:SS format
 * Updated to use UTC methods for consistent timezone handling
 * @param date DateTime object or null/undefined
 * @returns string in format "HH:MM:SS" or null if input is null/undefined
 */
export function dateTimeToTimeString(date: Date | null | undefined): string | null {
  if (!date) return null;
  
  // Ensure we have a valid Date object
  const dateObj = date instanceof Date ? date : new Date(date);
  
  if (isNaN(dateObj.getTime())) {
    return null;
  }
  
  // Use UTC methods to match the UTC storage approach
  const hours = dateObj.getUTCHours().toString().padStart(2, '0');
  const minutes = dateObj.getUTCMinutes().toString().padStart(2, '0');
  const seconds = dateObj.getUTCSeconds().toString().padStart(2, '0');
  
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Transform a worksheet record to have time-only strings instead of DateTime objects
 * @param record WorkSheetRecord object with DateTime startTime/endTime
 * @returns Record with startTime/endTime as time-only strings
 */
export function transformWorksheetRecord(record: any): any {
  if (!record) return record;
  
  return {
    ...record,
    startTime: dateTimeToTimeString(record.startTime),
    endTime: dateTimeToTimeString(record.endTime),
  };
}

/**
 * Transform an array of worksheet records
 * @param records Array of WorkSheetRecord objects
 * @returns Array of records with time-only strings
 */
export function transformWorksheetRecords(records: any[]): any[] {
  if (!Array.isArray(records)) return records;
  
  return records.map(transformWorksheetRecord);
}

/**
 * Transform a worksheet with its records and nested records
 * @param worksheet Worksheet object that may contain records
 * @returns Worksheet with transformed time fields
 */
export function transformWorksheet(worksheet: any): any {
  if (!worksheet) return worksheet;
  
  const transformed = { ...worksheet };
  
  // Transform direct records if they exist
  if (transformed.records) {
    transformed.records = transformWorksheetRecords(transformed.records);
  }
  
  // Transform nested item records if they exist
  if (transformed.items) {
    transformed.items = transformed.items.map((item: any) => ({
      ...item,
      records: item.records ? item.records.map((itemRecord: any) => ({
        ...itemRecord,
        record: itemRecord.record ? transformWorksheetRecord(itemRecord.record) : itemRecord.record
      })) : item.records
    }));
  }
  
  return transformed;
}

/**
 * Transform multiple worksheets
 * @param worksheets Array of worksheet objects
 * @returns Array of worksheets with transformed time fields
 */
export function transformWorksheets(worksheets: any[]): any[] {
  if (!Array.isArray(worksheets)) return worksheets;
  
  return worksheets.map(transformWorksheet);
}