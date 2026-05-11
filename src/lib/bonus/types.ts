export type BonusEmployeeStatus = "ACTIVE" | "PIP" | "NOTICE" | "EXITED";

export type BonusCategory = "TOP_MGMT" | "TOP_EPD" | "GOOD" | "PIP" | "NOTICE";

export type BonusEmployee = {
  id: string;
  name: string;
  email: string;
  role: string;
  team: "Revenue" | "Operations" | "Support";
  baseSalary: number;
  status: BonusEmployeeStatus;
  category: BonusCategory;
  /** Super-admin override: employee-specific points for allocation */
  pointsOverride?: number | null;
  /** Super-admin override: employee bonus value (skips engine allocation for this row) */
  bonusOverride?: number | null;
  metrics: {
    teamLeadFeedback: number; // 0-5
    performanceScore: number; // 0-100
    okrScore: number; // 0-1
    workingHours: number; // quarterly total
  };
};

export type BonusInputs = {
  grossProfit: number;
  bonusPoolPct: number; // 0-25
  splitTopPct: number; // 0-100
  splitGoodPct: number; // derived (100-splitTopPct)
  points: {
    topMgmt: number;
    topEpd: number;
    good: number;
  };
};

export type BonusAllocRow = {
  employeeId: string;
  employeeName: string;
  role: string;
  team: BonusEmployee["team"];
  category: BonusCategory;
  eligible: boolean;
  points: number;
  bonus: number;
};

export type BonusAllocation = {
  totalPool: number;
  poolTop: number;
  poolGood: number;
  totals: {
    mgmt: number;
    epd: number;
    good: number;
    ineligible: number;
  };
  qualifiedHeadcount: number;
  rows: BonusAllocRow[];
};
