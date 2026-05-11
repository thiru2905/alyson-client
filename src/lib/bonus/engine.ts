import type { BonusAllocation, BonusCategory, BonusEmployee, BonusInputs, BonusAllocRow } from "./types";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function roundCurrency(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function categoryPoints(category: BonusCategory, inputs: BonusInputs) {
  switch (category) {
    case "TOP_MGMT":
      return inputs.points.topMgmt;
    case "TOP_EPD":
      return inputs.points.topEpd;
    case "GOOD":
      return inputs.points.good;
    case "PIP":
    case "NOTICE":
      return 0;
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}

function isEligible(category: BonusCategory) {
  return category === "TOP_MGMT" || category === "TOP_EPD" || category === "GOOD";
}

function employeePoints(e: BonusEmployee, inputs: BonusInputs) {
  if (typeof e.pointsOverride === "number" && Number.isFinite(e.pointsOverride)) {
    return clamp(e.pointsOverride, 0, 100);
  }
  return categoryPoints(e.category, inputs);
}

export function normalizeInputs(raw: BonusInputs): BonusInputs {
  const grossProfit = Math.max(0, Number(raw.grossProfit) || 0);
  const bonusPoolPct = clamp(Number(raw.bonusPoolPct) || 0, 0, 25);
  const splitTopPct = clamp(Number(raw.splitTopPct) || 0, 0, 100);
  const splitGoodPct = 100 - splitTopPct;
  const points = {
    topMgmt: clamp(Number(raw.points.topMgmt) || 0, 0, 10),
    topEpd: clamp(Number(raw.points.topEpd) || 0, 0, 10),
    good: clamp(Number(raw.points.good) || 0, 0, 10),
  };

  return { grossProfit, bonusPoolPct, splitTopPct, splitGoodPct, points };
}

export function allocateBonus(employees: BonusEmployee[], inputsRaw: BonusInputs): BonusAllocation {
  const inputs = normalizeInputs(inputsRaw);

  const totalPool = (inputs.grossProfit * inputs.bonusPoolPct) / 100;
  const poolTop = (totalPool * inputs.splitTopPct) / 100;
  const poolGood = (totalPool * inputs.splitGoodPct) / 100;

  const top = employees.filter((e) => e.category === "TOP_MGMT" || e.category === "TOP_EPD");
  const good = employees.filter((e) => e.category === "GOOD");

  const topPointsSum = top.reduce((s, e) => s + employeePoints(e, inputs), 0);
  const goodCount = good.length;

  const valuePerPointTop = topPointsSum > 0 ? poolTop / topPointsSum : 0;
  const valuePerHeadGood = goodCount > 0 ? poolGood / goodCount : 0;

  const rows: BonusAllocRow[] = employees.map((e) => {
    const points = employeePoints(e, inputs);
    const eligible = isEligible(e.category);
    let bonus = 0;

    if (typeof e.bonusOverride === "number" && Number.isFinite(e.bonusOverride)) {
      bonus = Math.max(0, e.bonusOverride);
    } else if (e.category === "TOP_MGMT" || e.category === "TOP_EPD") bonus = valuePerPointTop * points;
    else if (e.category === "GOOD") bonus = valuePerHeadGood;
    else bonus = 0;

    return {
      employeeId: e.id,
      employeeName: e.name,
      role: e.role,
      team: e.team,
      category: e.category,
      eligible,
      points,
      bonus: roundCurrency(bonus),
    };
  });

  const totals = rows.reduce(
    (acc, r) => {
      if (!r.eligible) acc.ineligible += r.bonus;
      else if (r.category === "TOP_MGMT") acc.mgmt += r.bonus;
      else if (r.category === "TOP_EPD") acc.epd += r.bonus;
      else if (r.category === "GOOD") acc.good += r.bonus;
      return acc;
    },
    { mgmt: 0, epd: 0, good: 0, ineligible: 0 }
  );

  const qualifiedHeadcount = rows.filter((r) => r.eligible).length;

  return {
    totalPool: roundCurrency(totalPool),
    poolTop: roundCurrency(poolTop),
    poolGood: roundCurrency(poolGood),
    totals: {
      mgmt: roundCurrency(totals.mgmt),
      epd: roundCurrency(totals.epd),
      good: roundCurrency(totals.good),
      ineligible: roundCurrency(totals.ineligible),
    },
    qualifiedHeadcount,
    rows,
  };
}

