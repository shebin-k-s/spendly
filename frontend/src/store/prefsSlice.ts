import { createSlice } from '@reduxjs/toolkit';

interface PrefsState {
  showGross: boolean;
}

const initialState: PrefsState = {
  showGross: localStorage.getItem('prefs_showGross') !== 'false',
};

const prefsSlice = createSlice({
  name: 'prefs',
  initialState,
  reducers: {
    toggleShowGross(state) {
      state.showGross = !state.showGross;
      localStorage.setItem('prefs_showGross', String(state.showGross));
    },
  },
});

export const { toggleShowGross } = prefsSlice.actions;
export default prefsSlice.reducer;
