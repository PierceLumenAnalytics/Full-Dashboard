export interface DateRange {
  preset: "7days" | "30days" | "90days" | "thisMonth" | "lastMonth" | "custom";
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export const formatDateToYYYYMMDD = (date: Date): string => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export const formatDisplayDate = (dateStr: string): string => {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", 
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];
  const mon = months[monthIdx] || "";
  return `${day} ${mon} ${year}`;
};

export const getPresetRange = (preset: DateRange["preset"]): { startDate: string; endDate: string } => {
  const today = new Date();
  let start = new Date();
  let end = new Date();

  switch (preset) {
    case "7days":
      start.setDate(today.getDate() - 6);
      break;
    case "30days":
      start.setDate(today.getDate() - 29);
      break;
    case "90days":
      start.setDate(today.getDate() - 89);
      break;
    case "thisMonth":
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      break;
    case "lastMonth":
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      end = new Date(today.getFullYear(), today.getMonth(), 0); // last day of prev month
      break;
    default:
      break;
  }

  return {
    startDate: formatDateToYYYYMMDD(start),
    endDate: formatDateToYYYYMMDD(end)
  };
};
