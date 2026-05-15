import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface FilterState {
  searchTerm: string;
  selectedCategoryId: string;
  isFilterOpen: boolean;
}

const initialState: FilterState = {
  searchTerm: '',
  selectedCategoryId: '',
  isFilterOpen: false,
};

const filterSlice = createSlice({
  name: 'filters',
  initialState,
  reducers: {
    setSearchTerm: (state, action: PayloadAction<string>) => {
      state.searchTerm = action.payload;
    },
    setCategoryId: (state, action: PayloadAction<string>) => {
      state.selectedCategoryId = action.payload;
    },
    setFilterOpen: (state, action: PayloadAction<boolean>) => {
      state.isFilterOpen = action.payload;
    },
    clearFilters: (state) => {
      state.searchTerm = '';
      state.selectedCategoryId = '';
    },
  },
});

export const { setSearchTerm, setCategoryId, setFilterOpen, clearFilters } = filterSlice.actions;
export default filterSlice.reducer;
