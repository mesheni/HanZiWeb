/**
 * F22b: сетка дней года для heatmap активности (недели × дни, Пн..Вс,
 * как GitHub). Чистая функция — отдельно от RN для тестируемости.
 * Ячейки за пределами года — null.
 */
export function buildYearGrid(year: number): Array<Array<string | null>> {
  const weeks: Array<Array<string | null>> = [];
  const start = new Date(Date.UTC(year, 0, 1));
  // Понедельник недели, содержащей 1 января.
  const cursor = new Date(start);
  cursor.setUTCDate(1 - ((start.getUTCDay() + 6) % 7));
  const end = new Date(Date.UTC(year, 11, 31));
  while (cursor <= end) {
    const week: Array<string | null> = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(cursor);
      week.push(date.getUTCFullYear() === year ? date.toISOString().slice(0, 10) : null);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}
