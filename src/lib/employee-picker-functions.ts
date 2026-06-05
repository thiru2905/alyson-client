import { createServerFn } from "@tanstack/react-start";
import type { EmployeePickerResponse } from "@/lib/employee-picker-types";

export type { EmployeePickerEntry, EmployeePickerResponse } from "@/lib/employee-picker-types";

export const getEmployeePickerDirectory = createServerFn({ method: "GET" }).handler(
  async (): Promise<EmployeePickerResponse> => {
    const { loadEmployeePickerDirectory } = await import("@/lib/employee-picker-directory.server");
    return loadEmployeePickerDirectory();
  },
);
