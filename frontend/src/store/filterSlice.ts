import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { SmartFilterCriteria } from '@/features/expenses/types';

export interface FilterState {
  searchTerm: string;
  selectedCategoryIds: string[];
  isFilterOpen: boolean;
  smartFilter: SmartFilterCriteria | null;
}

const initialState: FilterState = {
  searchTerm: '',
  selectedCategoryIds: [],
  isFilterOpen: false,
  smartFilter: null,
};

const filterSlice = createSlice({
  name: 'filters',
  initialState,
  reducers: {
    setSearchTerm: (state, action: PayloadAction<string>) => {
      state.searchTerm = action.payload;
    },
    toggleCategoryId: (state, action: PayloadAction<string>) => {
      const id = action.payload;
      const idx = state.selectedCategoryIds.indexOf(id);
      if (idx === -1) {
        state.selectedCategoryIds.push(id);
      } else {
        state.selectedCategoryIds.splice(idx, 1);
      }
    },
    setFilterOpen: (state, action: PayloadAction<boolean>) => {
      state.isFilterOpen = action.payload;
    },
    setSmartFilter: (state, action: PayloadAction<SmartFilterCriteria | null>) => {
      state.smartFilter = action.payload;
    },
    clearFilters: (state) => {
      state.searchTerm = '';
      state.selectedCategoryIds = [];
      state.smartFilter = null;
    },
    clearCategories: (state) => {
      state.selectedCategoryIds = [];
    },
  },
});

export const { setSearchTerm, toggleCategoryId, setFilterOpen, setSmartFilter, clearFilters, clearCategories } = filterSlice.actions;
export default filterSlice.reducer;
