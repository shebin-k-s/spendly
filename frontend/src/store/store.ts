import { configureStore } from '@reduxjs/toolkit';
import dateReducer from './dateSlice';
import filterReducer from './filterSlice';

export const store = configureStore({
  reducer: {
    date: dateReducer,
    filters: filterReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
