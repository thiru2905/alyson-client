export type EmployeePickerEntry = {
  email: string;
  name: string;
  /** When known from Time Doctor — skips a full user-list fetch on hourly reports. */
  timeDoctorUserId?: string;
};

export type EmployeePickerResponse = {
  employees: EmployeePickerEntry[];
  warnings: string[];
};
