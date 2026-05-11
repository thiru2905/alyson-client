import { useCallback, useEffect, useState } from "react";
import {
  defaultPersisted,
  loadBoardingState,
  saveBoardingState,
  type BoardingFlow,
  type BoardingPersisted,
} from "@/lib/boarding-storage";

export function useBoardingChecklists() {
  const [state, setState] = useState<BoardingPersisted>(defaultPersisted);

  useEffect(() => {
    setState(loadBoardingState());
  }, []);

  const persist = useCallback((updater: (prev: BoardingPersisted) => BoardingPersisted) => {
    setState((prev) => {
      const next = updater(prev);
      saveBoardingState(next);
      return next;
    });
  }, []);

  const setChecked = useCallback(
    (flow: BoardingFlow, taskId: string, value: boolean) => {
      persist((prev) => {
        if (flow === "onboarding") {
          return {
            ...prev,
            onboardingChecked: { ...prev.onboardingChecked, [taskId]: value },
          };
        }
        return {
          ...prev,
          offboardingChecked: { ...prev.offboardingChecked, [taskId]: value },
        };
      });
    },
    [persist],
  );

  const setContextLabel = useCallback(
    (contextLabel: string) => {
      persist((prev) => ({ ...prev, contextLabel }));
    },
    [persist],
  );

  const resetFlow = useCallback(
    (flow: BoardingFlow) => {
      const fresh = defaultPersisted();
      persist((prev) =>
        flow === "onboarding"
          ? { ...prev, onboardingChecked: fresh.onboardingChecked }
          : { ...prev, offboardingChecked: fresh.offboardingChecked },
      );
    },
    [persist],
  );

  return { state, setChecked, setContextLabel, resetFlow };
}
