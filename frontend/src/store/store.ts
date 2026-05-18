import { configureStore } from '@reduxjs/toolkit';
import dateReducer from './dateSlice';
import filterReducer from './filterSlice';
import prefsReducer from './prefsSlice';

export const store = configureStore({
  reducer: {
    date: dateReducer,
    filters: filterReducer,
    prefs: prefsReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
