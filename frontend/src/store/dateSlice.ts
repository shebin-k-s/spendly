import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { currentYearMonth } from '@/lib/utils';

export interface DateState {
  year: number;
  month: number;
}

const SESSION_KEY = 'spendly_selected_date';

const getInitialState = (): DateState => {
  try {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed.year === 'number' && typeof parsed.month === 'number') {
        return { year: parsed.year, month: parsed.month };
      }
    }
  } catch (e) {
    // Ignore parse errors
  }
  return currentYearMonth();
};

const initialState: DateState = getInitialState();

const dateSlice = createSlice({
  name: 'date',
  initialState,
  reducers: {
    setDate: (state, action: PayloadAction<{ year: number; month: number }>) => {
      state.year = action.payload.year;
      state.month = action.payload.month;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ year: state.year, month: state.month }));
    },
    resetDate: (state) => {
      const current = currentYearMonth();
      state.year = current.year;
      state.month = current.month;
      sessionStorage.removeItem(SESSION_KEY);
    },
  },
});

export const { setDate, resetDate } = dateSlice.actions;
export default dateSlice.reducer;
