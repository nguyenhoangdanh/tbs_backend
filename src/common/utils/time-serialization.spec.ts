import { dateTimeToTimeString, transformWorksheetRecord, transformWorksheet } from './time-serialization';

describe('Time Serialization Utils', () => {
  describe('dateTimeToTimeString', () => {
    it('should convert DateTime to time-only string', () => {
      const date = new Date('2024-01-15T07:30:00.000Z');
      const result = dateTimeToTimeString(date);
      expect(result).toBe('07:30:00');
    });

    it('should handle different times', () => {
      const date = new Date('2024-01-15T15:45:30.000Z');
      const result = dateTimeToTimeString(date);
      expect(result).toBe('15:45:30');
    });

    it('should return null for null input', () => {
      const result = dateTimeToTimeString(null);
      expect(result).toBeNull();
    });

    it('should return null for undefined input', () => {
      const result = dateTimeToTimeString(undefined);
      expect(result).toBeNull();
    });

    it('should handle invalid date', () => {
      const result = dateTimeToTimeString(new Date('invalid'));
      expect(result).toBeNull();
    });
  });

  describe('transformWorksheetRecord', () => {
    it('should transform record with DateTime to time strings', () => {
      const record = {
        id: 'record-1',
        workHour: 1,
        startTime: new Date('2024-01-15T07:30:00.000Z'),
        endTime: new Date('2024-01-15T08:30:00.000Z'),
        status: 'PENDING'
      };

      const result = transformWorksheetRecord(record);
      
      expect(result).toEqual({
        id: 'record-1',
        workHour: 1,
        startTime: '07:30:00',
        endTime: '08:30:00',
        status: 'PENDING'
      });
    });

    it('should handle null record', () => {
      const result = transformWorksheetRecord(null);
      expect(result).toBeNull();
    });
  });

  describe('transformWorksheet', () => {
    it('should transform worksheet with records', () => {
      const worksheet = {
        id: 'worksheet-1',
        date: '2024-01-15',
        records: [
          {
            id: 'record-1',
            workHour: 1,
            startTime: new Date('2024-01-15T07:30:00.000Z'),
            endTime: new Date('2024-01-15T08:30:00.000Z'),
            status: 'PENDING'
          },
          {
            id: 'record-2',
            workHour: 2,
            startTime: new Date('2024-01-15T08:30:00.000Z'),
            endTime: new Date('2024-01-15T09:30:00.000Z'),
            status: 'PENDING'
          }
        ]
      };

      const result = transformWorksheet(worksheet);
      
      expect(result.records[0].startTime).toBe('07:30:00');
      expect(result.records[0].endTime).toBe('08:30:00');
      expect(result.records[1].startTime).toBe('08:30:00');
      expect(result.records[1].endTime).toBe('09:30:00');
    });

    it('should handle worksheet without records', () => {
      const worksheet = {
        id: 'worksheet-1',
        date: '2024-01-15'
      };

      const result = transformWorksheet(worksheet);
      expect(result).toEqual(worksheet);
    });
  });
});