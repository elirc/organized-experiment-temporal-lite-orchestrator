import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function prettyDate(value?: string | Date | null) {
  if (!value) {
    return "Pending";
  }

  return new Date(value).toLocaleString();
}
