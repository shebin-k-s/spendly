export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  isDefault: boolean;
  createdAt: string;
}

export interface CreateCategoryPayload {
  name: string;
  icon: string;
  color: string;
}

export interface UpdateCategoryPayload extends CreateCategoryPayload {
  id: string;
}
