import { render, screen, waitFor } from "@testing-library/react";
import { CalendarDate } from "@internationalized/date";

import AgendaDailyCalendar from "../agenda-daily-calendar";

jest.mock("@heroui/react", () => {
  const actual = jest.requireActual("@heroui/react");

  return {
    ...actual,
    Calendar: ({ value }: { value: CalendarDate }) => {
      if (value.month === 7) {
        return (
          <table>
            <tbody>
              <tr>
                <td data-slot="cell">
                  <span data-testid="july-day-9">9</span>
                </td>
                <td data-slot="cell">
                  <span data-testid="july-day-10">10</span>
                </td>
              </tr>
            </tbody>
          </table>
        );
      }

      return (
        <table>
          <tbody>
            <tr>
              <td data-slot="cell">
                <span data-outside-month="true" data-testid="outside-day-31">
                  31
                </span>
              </td>
              <td data-slot="cell">
                <span data-testid="june-day-8">8</span>
              </td>
              <td data-slot="cell">
                <span data-testid="june-day-9">9</span>
              </td>
            </tr>
          </tbody>
        </table>
      );
    },
  };
});

describe("AgendaDailyCalendar", () => {
  it("marca apenas os dias do mes visivel que tem evento", async () => {
    render(
      <AgendaDailyCalendar
        markerDateKeys={["2026-06-09"]}
        selectedDate={new CalendarDate(2026, 6, 8)}
        onChange={jest.fn()}
        onFocusChange={jest.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("june-day-9").getAttribute("data-has-events")).toBe(
        "true",
      ),
    );

    expect(screen.getByTestId("june-day-8").hasAttribute("data-has-events")).toBe(
      false,
    );
    expect(
      screen.getByTestId("outside-day-31").hasAttribute("data-has-events"),
    ).toBe(false);
  });

  it("remove marcacoes antigas quando os filtros mudam no mesmo mes", async () => {
    const { rerender } = render(
      <AgendaDailyCalendar
        markerDateKeys={["2026-06-09"]}
        selectedDate={new CalendarDate(2026, 6, 8)}
        onChange={jest.fn()}
        onFocusChange={jest.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("june-day-9").getAttribute("data-has-events")).toBe(
        "true",
      ),
    );

    rerender(
      <AgendaDailyCalendar
        markerDateKeys={["2026-06-08"]}
        selectedDate={new CalendarDate(2026, 6, 8)}
        onChange={jest.fn()}
        onFocusChange={jest.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("june-day-8").getAttribute("data-has-events")).toBe(
        "true",
      ),
    );

    expect(screen.getByTestId("june-day-9").hasAttribute("data-has-events")).toBe(
      false,
    );
  });

  it("reaplica marcacoes ao trocar o mes visivel", async () => {
    const { rerender } = render(
      <AgendaDailyCalendar
        markerDateKeys={["2026-06-09"]}
        selectedDate={new CalendarDate(2026, 6, 8)}
        onChange={jest.fn()}
        onFocusChange={jest.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("june-day-9").getAttribute("data-has-events")).toBe(
        "true",
      ),
    );

    rerender(
      <AgendaDailyCalendar
        markerDateKeys={["2026-07-10"]}
        selectedDate={new CalendarDate(2026, 7, 10)}
        onChange={jest.fn()}
        onFocusChange={jest.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("july-day-10").getAttribute("data-has-events")).toBe(
        "true",
      ),
    );

    expect(screen.getByTestId("july-day-9").hasAttribute("data-has-events")).toBe(
      false,
    );
  });
});
