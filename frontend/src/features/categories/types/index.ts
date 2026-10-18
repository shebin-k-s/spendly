export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  groupName: string | null;
  isDefault: boolean;
  createdAt: string;
}

export interface CreateCategoryPayload {
  name: string;
  icon: string;
  color: string;
  groupName: string;
}

export interface UpdateCategoryPayload extends CreateCategoryPayload {
  id: string;
}

export interface CategoryGroup {
  id: string;
  name: string;
  sortOrder: number;
}
