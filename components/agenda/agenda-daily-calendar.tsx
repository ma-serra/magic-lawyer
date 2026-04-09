"use client";

import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { Button, Calendar as CalendarComponent } from "@heroui/react";
import {
  type CalendarDate,
  getLocalTimeZone,
  startOfMonth,
  startOfWeek,
  today,
} from "@internationalized/date";

interface AgendaDailyCalendarProps {
  markerDateKeys: string[];
  selectedDate: CalendarDate;
  topContent?: ReactNode;
  value?: CalendarDate;
  onChange: (value: CalendarDate) => void;
  onFocusChange: (value: CalendarDate) => void;
}

function buildMarkerDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function clearEventMarkers(root: HTMLElement) {
  root
    .querySelectorAll<HTMLElement>("[data-has-events='true']")
    .forEach((cellButton) => cellButton.removeAttribute("data-has-events"));
}

function applyEventMarkers(
  root: HTMLElement,
  selectedDate: CalendarDate,
  markerDateKeys: Set<string>,
) {
  clearEventMarkers(root);

  root
    .querySelectorAll<HTMLSpanElement>("td[data-slot='cell'] > span")
    .forEach((cellButton) => {
      if (cellButton.getAttribute("data-outside-month") === "true") {
        return;
      }

      const day = Number.parseInt(cellButton.textContent?.trim() ?? "", 10);

      if (!Number.isInteger(day) || day < 1) {
        return;
      }

      const dateKey = buildMarkerDateKey(
        selectedDate.year,
        selectedDate.month,
        day,
      );

      if (markerDateKeys.has(dateKey)) {
        cellButton.setAttribute("data-has-events", "true");
      }
    });
}

export default function AgendaDailyCalendar({
  markerDateKeys,
  selectedDate,
  value,
  onChange,
  onFocusChange,
}: AgendaDailyCalendarProps) {
  const calendarWrapperRef = useRef<HTMLDivElement | null>(null);
  const markerSignature = useMemo(
    () => [...markerDateKeys].sort().join("|"),
    [markerDateKeys],
  );
  const markerDateKeySet = useMemo(
    () => new Set(markerDateKeys),
    [markerSignature, markerDateKeys],
  );
  useEffect(() => {
    const root = calendarWrapperRef.current;

    if (!root) {
      return;
    }

    let animationFrameId = 0;
    const scheduleMarkerApply = () => {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = window.requestAnimationFrame(() => {
        applyEventMarkers(root, selectedDate, markerDateKeySet);
      });
    };

    scheduleMarkerApply();

    const observer = new MutationObserver(() => {
      scheduleMarkerApply();
    });

    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-outside-month", "data-selected", "data-today"],
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      observer.disconnect();
      clearEventMarkers(root);
    };
  }, [markerDateKeySet, markerSignature, selectedDate]);

  return (
    <div ref={calendarWrapperRef}>
      <CalendarComponent
        aria-label="Agenda"
        classNames={{
          base: "w-full max-w-full",
          cell: "h-16 min-w-0 w-full text-center text-lg font-medium",
          cellButton:
            "relative after:pointer-events-none after:absolute after:bottom-1.5 after:left-1/2 after:h-1.5 after:w-1.5 after:-translate-x-1/2 after:rounded-full after:bg-warning-400 after:opacity-0 after:content-[''] data-[has-events=true]:after:opacity-100 data-[selected=true]:after:bg-warning-200 data-[outside-month=true]:after:opacity-0",
          content: "w-full max-w-full overflow-hidden",
          grid: "w-full max-w-full",
        }}
        focusedValue={selectedDate as any}
        nextButtonProps={{
          size: "lg",
          variant: "bordered",
        }}
        prevButtonProps={{
          size: "lg",
          variant: "bordered",
        }}
        topContent={
          <div className="border-b border-divider/70 bg-content1 px-4 py-4">
            <div className="flex flex-wrap gap-2">
              <Button
                radius="full"
                size="sm"
                variant="bordered"
                onPress={() => onChange(today(getLocalTimeZone()))}
              >
                Hoje
              </Button>
              <Button
                radius="full"
                size="sm"
                variant="bordered"
                onPress={() =>
                  onChange(
                    startOfWeek(
                      today(getLocalTimeZone()).add({ weeks: 1 }),
                      "pt-BR",
                    ) as CalendarDate,
                  )
                }
              >
                Proxima semana
              </Button>
              <Button
                radius="full"
                size="sm"
                variant="bordered"
                onPress={() =>
                  onChange(
                    startOfMonth(
                      today(getLocalTimeZone()).add({ months: 1 }),
                    ) as CalendarDate,
                  )
                }
              >
                Proximo mes
              </Button>
            </div>
          </div>
        }
        value={(value ?? selectedDate) as any}
        onChange={onChange as any}
        onFocusChange={onFocusChange as any}
      />
    </div>
  );
}
