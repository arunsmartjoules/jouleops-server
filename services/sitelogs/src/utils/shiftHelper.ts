/**
 * Shift Calculation Helper
 * 
 * Standard Shifts (IST):
 * - Morning: 06:00 AM - 02:00 PM
 * - Evening: 02:00 PM - 10:00 PM
 * - Night:   10:00 PM - 06:00 AM (next day)
 */

export function calculateDateShift(dateInput?: Date | string | number | null): string {
  // Default to current time if no date provided
  const date = dateInput ? new Date(dateInput) : new Date();
  
  // Convert to IST (UTC+5:30) for calculation
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(date.getTime() + istOffset);
  
  const hours = istDate.getUTCHours();
  const minutes = istDate.getUTCMinutes();
  const timeValue = hours + minutes / 60;

  let shift = "";
  let datePart = istDate.toISOString().split("T")[0];

  if (timeValue >= 6 && timeValue < 14) {
    shift = "Morning";
  } else if (timeValue >= 14 && timeValue < 22) {
    shift = "Evening";
  } else {
    shift = "Night";
    // If it's between 00:00 and 06:00, it belongs to the previous day's night shift
    if (timeValue < 6) {
      const prevDay = new Date(istDate.getTime() - 24 * 60 * 60 * 1000);
      datePart = prevDay.toISOString().split("T")[0];
    }
  }

  return `${datePart} ${shift}`;
}

export default {
  calculateDateShift,
};
