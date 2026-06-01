import { createSlice, PayloadAction } from '@reduxjs/toolkit';
export interface FilterState {
  searchTerm: string;
  selectedCategoryIds: string[];
  isFilterOpen: boolean;
}

const initialState: FilterState = {
  searchTerm: '',
  selectedCategoryIds: [],
  isFilterOpen: false,
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
    clearFilters: (state) => {
      state.searchTerm = '';
      state.selectedCategoryIds = [];
    },
    clearCategories: (state) => {
      state.selectedCategoryIds = [];
    },
  },
});

export const { setSearchTerm, toggleCategoryId, setFilterOpen, clearFilters, clearCategories } = filterSlice.actions;
export default filterSlice.reducer;
