import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { currentYearMonth } from '@/lib/utils';

export interface DateState {
  year: number;
  month: number;
}

const initialState: DateState = currentYearMonth();

const dateSlice = createSlice({
  name: 'date',
  initialState,
  reducers: {
    setDate: (state, action: PayloadAction<{ year: number; month: number }>) => {
      state.year = action.payload.year;
      state.month = action.payload.month;
    },
    resetDate: (state) => {
      const current = currentYearMonth();
      state.year = current.year;
      state.month = current.month;
    },
  },
});

export const { setDate, resetDate } = dateSlice.actions;
export default dateSlice.reducer;
